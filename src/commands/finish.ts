/**
 * Finish command: merge workflow branch into target(s), optional tag, delete branch, and push.
 * Guards empty/dirty finishes, delete-by-default, bugfix-from-main, plan preview, run-state.
 * @module commands/finish
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBranchTypeMeta, resolveConfig } from "../config.js";
import { EXIT_USER } from "../constants.js";
import { BranchNotFoundError, DirtyWorkingTreeError, NothingToFinishError } from "../errors.js";
import {
  filterWorkflowBranches,
  formatMergeTarget,
  normalizeTagVersion,
  parseBranchTypeAndVersion,
  primaryTargetBranch,
  resolveMergeTarget,
} from "../flow.js";
import {
  assertNoRebaseOrMerge,
  assertNotDetached,
  branchList,
  checkout,
  deleteBranch,
  deleteRemoteBranch,
  getAheadBehind,
  getCurrentBranch,
  getUpstream,
  isClean,
  merge,
  push,
  resolveRepoRoot,
  resolveSha,
  runGit,
  tag,
  tagExists,
} from "../git.js";
import { hint, success } from "../out.js";
import {
  completeRun,
  type GflowsRunState,
  startRun,
  suspendRun,
  writeActiveRun,
} from "../run-state.js";
import type { BranchType, MergeTarget, ParsedArgs, ResolvedConfig } from "../types.js";

interface FinishContext {
  branchToFinish: string;
  type: BranchType;
  version?: string;
  mergeTarget: MergeTarget;
  shouldDelete: boolean;
  doPush: boolean;
  noFf: boolean;
  squash: boolean;
  message?: string;
  signTag: boolean;
  noTag: boolean;
  tagMessage?: string;
  remote: string;
  main: string;
  dev: string;
  bumpOnFinish: boolean;
}

/**
 * Runs remaining finish steps from run state (also used by continue).
 */
export async function executeFinishSteps(
  repoRoot: string,
  state: GflowsRunState,
  opts: { dryRun: boolean; verbose: boolean; quiet: boolean },
): Promise<void> {
  const ctx = state.context as unknown as FinishContext;
  let i = state.nextStep;
  while (i < state.steps.length) {
    const step = state.steps[i];
    if (!step) break;
    try {
      await runFinishStep(repoRoot, step.id, ctx, opts);
      i += 1;
      state.nextStep = i;
      writeActiveRun(repoRoot, { ...state, status: "running" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      suspendRun(repoRoot, { ...state, nextStep: i }, msg);
      throw err;
    }
  }
  completeRun(repoRoot, state);
  if (!opts.quiet && !opts.dryRun) {
    const tagName = typeof state.undo.createdTag === "string" ? state.undo.createdTag : undefined;
    const tagSuffix = tagName ? ` (tag ${tagName})` : "";
    const targets = formatMergeTarget(ctx.mergeTarget, {
      main: ctx.main,
      dev: ctx.dev,
      remote: ctx.remote,
      prefixes: {
        feature: "feature/",
        bugfix: "bugfix/",
        chore: "chore/",
        release: "release/",
        hotfix: "hotfix/",
        spike: "spike/",
      },
    });
    success(`gflows: finished '${ctx.branchToFinish}' into ${targets}${tagSuffix}.`);
    hint("Run gflows start <type> <name> to create a new workflow branch.");
  }
}

async function runFinishStep(
  repoRoot: string,
  stepId: string,
  ctx: FinishContext,
  opts: { dryRun: boolean; verbose: boolean; quiet: boolean },
): Promise<void> {
  const mergeOpts = {
    ...opts,
    noFf: ctx.noFf,
    squash: ctx.squash,
    message: ctx.message,
  };

  switch (stepId) {
    case "bump": {
      if (!ctx.bumpOnFinish) return;
      // Bump is handled before run starts when requested; step reserved for resume
      return;
    }
    case "merge-dev": {
      await checkout(repoRoot, ctx.dev, opts);
      await merge(repoRoot, ctx.branchToFinish, mergeOpts);
      return;
    }
    case "merge-main": {
      await checkout(repoRoot, ctx.main, opts);
      await merge(repoRoot, ctx.branchToFinish, mergeOpts);
      return;
    }
    case "tag": {
      if (ctx.noTag || !ctx.version) return;
      const tagName = normalizeTagVersion(ctx.version);
      await tag(repoRoot, tagName, {
        ...opts,
        sign: ctx.signTag,
        tagMessage: ctx.tagMessage,
      });
      if (!opts.quiet && !opts.dryRun) {
        success(`gflows: created tag '${tagName}'.`);
      }
      return;
    }
    case "merge-main-into-dev": {
      await checkout(repoRoot, ctx.dev, opts);
      await merge(repoRoot, ctx.main, { ...opts, noFf: ctx.noFf, message: ctx.message });
      return;
    }
    case "delete": {
      if (!ctx.shouldDelete) return;
      const upstream = await getUpstream(repoRoot, ctx.branchToFinish, opts).catch(() => null);
      await deleteBranch(repoRoot, ctx.branchToFinish, { ...opts, force: true });
      if (!opts.quiet && !opts.dryRun) {
        success(`gflows: deleted branch '${ctx.branchToFinish}'.`);
      }
      if (!opts.dryRun && upstream) {
        const code = await deleteRemoteBranch(repoRoot, ctx.remote, ctx.branchToFinish, opts);
        if (code === 0 && !opts.quiet) {
          success(`gflows: deleted remote branch '${ctx.remote}/${ctx.branchToFinish}'.`);
        }
      }
      return;
    }
    case "push": {
      if (!ctx.doPush) return;
      const refsToPush: string[] = [ctx.dev];
      if (ctx.mergeTarget === "main-then-dev") {
        refsToPush.push(ctx.main);
      }
      const didCreateTag = Boolean(ctx.version && !ctx.noTag);
      const pushCode = await push(repoRoot, ctx.remote, refsToPush, didCreateTag, opts);
      if (pushCode !== 0) {
        throw new Error(
          "Merge and tag succeeded locally, but push failed. Retry with `git push` or `gflows continue` / `gflows finish ... --push`.",
        );
      }
      if (!opts.quiet && !opts.dryRun) {
        success(`gflows: pushed to ${ctx.remote}.`);
      }
      return;
    }
    case "changelog": {
      maybeTouchChangelog(repoRoot, ctx.version, opts);
      return;
    }
    default:
      return;
  }
}

function maybeTouchChangelog(
  repoRoot: string,
  version: string | undefined,
  opts: { dryRun: boolean; quiet: boolean },
): void {
  if (!version) return;
  const path = join(repoRoot, "CHANGELOG.md");
  if (!existsSync(path)) return;
  if (opts.dryRun) return;
  try {
    const raw = readFileSync(path, "utf-8");
    if (!raw.includes("## [Unreleased]")) return;
    const tag = normalizeTagVersion(version);
    if (raw.includes(`## [${tag.replace(/^v/, "")}]`) || raw.includes(`## [${tag}]`)) return;
    const date = new Date().toISOString().slice(0, 10);
    const ver = tag.replace(/^v/, "");
    const stub = `## [Unreleased]\n\n## [${ver}] - ${date}\n\n`;
    const updated = raw.replace("## [Unreleased]\n", stub);
    writeFileSync(path, updated, "utf-8");
    if (!opts.quiet) {
      success(`gflows: updated CHANGELOG.md for ${ver}.`);
    }
  } catch {
    // ignore changelog failures
  }
}

/**
 * Runs the finish command.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );

  const opts = { dryRun: args.dryRun, verbose: args.verbose, quiet: args.quiet };
  const isTTY = Boolean(process.stdin.isTTY);

  let branchToFinish: string;
  const explicitBranch =
    typeof args.branch === "string" && args.branch.trim() !== "" ? args.branch.trim() : undefined;

  if (explicitBranch) {
    branchToFinish = explicitBranch;
  } else if (isTTY) {
    const workflow = filterWorkflowBranches(
      await branchList(repoRoot, { dryRun: false, verbose: false }),
      config.prefixes,
    );
    if (workflow.length === 0) {
      console.error("gflows finish: no workflow branches found.");
      hint("Create one with: gflows start feature <name>");
      process.exit(EXIT_USER);
    }
    const current = await getCurrentBranch(repoRoot, opts);
    const { selectPrompt } = await import("../prompts.js");
    branchToFinish = await selectPrompt({
      message: "Branch to finish",
      options: workflow.map((b) => ({
        label: b === current ? `${b} (current)` : b,
        value: b,
      })),
      initialValue: current && workflow.includes(current) ? current : workflow[0],
    });
  } else {
    const current = await getCurrentBranch(repoRoot, opts);
    if (!current) {
      console.error(
        "gflows finish: HEAD is detached. Checkout a branch or specify one with -B <name>.",
      );
      process.exit(EXIT_USER);
    }
    branchToFinish = current;
  }

  if (branchToFinish === config.main || branchToFinish === config.dev) {
    console.error(
      `gflows finish: cannot finish the long-lived branch '${branchToFinish}'. Finish a workflow branch (feature, bugfix, etc.) instead.`,
    );
    process.exit(2);
  }

  const parsed = parseBranchTypeAndVersion(branchToFinish, config.prefixes);
  const type: BranchType | undefined = args.type ?? parsed?.type ?? undefined;
  if (!type) {
    console.error(
      `gflows finish: cannot determine branch type for '${branchToFinish}'. Specify type (e.g. gflows finish feature) or use a known prefix (${Object.values(config.prefixes).join(", ")}).`,
    );
    process.exit(EXIT_USER);
  }
  if (parsed && parsed.type !== type) {
    console.error(
      `gflows finish: branch '${branchToFinish}' matches type '${parsed.type}', but '${type}' was specified.`,
    );
    process.exit(EXIT_USER);
  }

  const version = parsed?.version;
  const meta = getBranchTypeMeta(type);
  const mergeTarget = await resolveMergeTarget(repoRoot, branchToFinish, type, config, opts);

  await assertNotDetached(repoRoot);
  assertNoRebaseOrMerge(repoRoot);

  if (!args.force) {
    const current = await getCurrentBranch(repoRoot, opts);
    if (current === branchToFinish) {
      const clean = await isClean(repoRoot, opts);
      if (!clean) {
        throw new DirtyWorkingTreeError(
          "Working tree has uncommitted changes. Commit or stash them before finish, or use --force.",
        );
      }
    }
  }

  const primary = primaryTargetBranch(mergeTarget, config);
  const { ahead } = await getAheadBehind(repoRoot, primary, branchToFinish, opts);
  if (ahead === 0) {
    throw new NothingToFinishError(
      `Nothing to finish: '${branchToFinish}' has no commits beyond '${primary}'.`,
    );
  }

  if (meta.tagOnFinish && version) {
    const tagName = normalizeTagVersion(version);
    if (await tagExists(repoRoot, tagName, opts)) {
      console.error(`gflows finish: tag '${tagName}' already exists.`);
      hint("Use a new version, or delete the tag if you intend to recreate it.");
      process.exit(2);
    }
  } else if (meta.tagOnFinish && !version) {
    console.error(
      `gflows finish: release/hotfix branch '${branchToFinish}' has no valid version segment. Use format release/vX.Y.Z or hotfix/vX.Y.Z.`,
    );
    process.exit(EXIT_USER);
  }

  const branches = await branchList(repoRoot, { ...opts, dryRun: false });
  if (!branches.includes(branchToFinish)) {
    throw new BranchNotFoundError(
      `Branch '${branchToFinish}' not found. Specify an existing local branch with -B <name>.`,
    );
  }

  // Delete default ON
  let shouldDelete = true;
  if (args.noDeleteAfterFinish) shouldDelete = false;
  else if (args.deleteAfterFinish) shouldDelete = true;
  else if (!args.yes && isTTY) {
    const { confirmPrompt } = await import("../prompts.js");
    shouldDelete = await confirmPrompt({
      message: "Delete branch after finish?",
      initialValue: true,
    });
  }
  // -y accepts plan including default delete

  let doPush = false;
  if (args.push && !args.noPush) doPush = true;
  else if (args.noPush) doPush = false;
  else if (!isTTY) {
    console.error("gflows finish: specify --push (-p) or --no-push (-P) when not interactive.");
    process.exit(EXIT_USER);
  } else if (!args.yes) {
    const { confirmPrompt } = await import("../prompts.js");
    doPush = await confirmPrompt({
      message: "Push after finish?",
      initialValue: false,
    });
  }

  const targetsDisplay = formatMergeTarget(mergeTarget, config);
  const tagName =
    meta.tagOnFinish && version && !args.noTag ? normalizeTagVersion(version) : undefined;

  console.error("gflows finish plan:");
  console.error(`  branch:  ${branchToFinish}`);
  console.error(`  merge:   → ${targetsDisplay}`);
  if (tagName) console.error(`  tag:     ${tagName}`);
  console.error(`  delete:  ${shouldDelete ? "yes" : "no"}`);
  console.error(`  push:    ${doPush ? "yes" : "no"}`);
  if (args.squash) console.error("  squash:  yes");

  if (args.preview) {
    success("gflows: preview only (no changes).");
    return;
  }

  if (args.bumpOnFinish && (type === "release" || type === "hotfix") && version) {
    await bumpAndCommit(repoRoot, version, args, config);
  }

  const steps =
    mergeTarget === "dev"
      ? [
          { id: "merge-dev", label: `Merge into ${config.dev}` },
          ...(shouldDelete ? [{ id: "delete", label: "Delete branch" }] : []),
          ...(doPush ? [{ id: "push", label: "Push" }] : []),
        ]
      : [
          { id: "merge-main", label: `Merge into ${config.main}` },
          ...(tagName ? [{ id: "tag", label: `Tag ${tagName}` }] : []),
          { id: "merge-main-into-dev", label: `Merge ${config.main} into ${config.dev}` },
          ...(tagName ? [{ id: "changelog", label: "Update CHANGELOG" }] : []),
          ...(shouldDelete ? [{ id: "delete", label: "Delete branch" }] : []),
          ...(doPush ? [{ id: "push", label: "Push" }] : []),
        ];

  const branchSha = await resolveSha(repoRoot, branchToFinish, opts);
  const mainSha = await resolveSha(repoRoot, config.main, opts);
  const devSha = await resolveSha(repoRoot, config.dev, opts);
  const prevBranch = await getCurrentBranch(repoRoot, opts);

  const ctx: FinishContext = {
    branchToFinish,
    type,
    version,
    mergeTarget,
    shouldDelete,
    doPush,
    noFf: args.noFf,
    squash: args.squash,
    message: args.message,
    signTag: args.signTag,
    noTag: args.noTag,
    tagMessage: args.tagMessage,
    remote: args.remote ?? config.remote,
    main: config.main,
    dev: config.dev,
    bumpOnFinish: args.bumpOnFinish,
  };

  const state = startRun(repoRoot, "finish", steps, ctx as unknown as Record<string, unknown>, {
    branchSha,
    mainSha,
    devSha,
    prevBranch,
    createdTag: tagName ?? null,
    branchName: branchToFinish,
    shouldDelete,
    main: config.main,
    dev: config.dev,
  });

  await executeFinishSteps(repoRoot, state, opts);
}

async function bumpAndCommit(
  repoRoot: string,
  version: string,
  args: ParsedArgs,
  _config: ResolvedConfig,
): Promise<void> {
  const ver = version.replace(/^v/, "");
  // Use bump command logic via spawning package files — light inline for finish --bump
  const pkgPath = join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    pkg.version = ver;
    if (!args.dryRun) {
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    }
    const jsrPath = join(repoRoot, "jsr.json");
    if (existsSync(jsrPath)) {
      let jsrRaw = readFileSync(jsrPath, "utf-8");
      jsrRaw = jsrRaw.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${ver}"`);
      if (!args.dryRun) writeFileSync(jsrPath, jsrRaw, "utf-8");
    }
    if (!args.dryRun) {
      await runGit(["add", "package.json", "jsr.json"], {
        cwd: repoRoot,
        dryRun: args.dryRun,
        verbose: args.verbose,
      });
      await runGit(["commit", "-m", `chore: bump to ${ver}`], {
        cwd: repoRoot,
        dryRun: args.dryRun,
        verbose: args.verbose,
      });
      if (!args.quiet) success(`gflows: bumped version to ${ver} and committed.`);
    }
  } catch {
    hint("finish --bump: could not bump/commit version files; continuing finish.");
  }
}
