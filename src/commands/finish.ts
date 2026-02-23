/**
 * Finish command: merge workflow branch into target(s), optional tag, delete branch, and push.
 * Resolves branch (current, -B &lt;name&gt;, or picker when -B with no value and TTY).
 * Uses normal merge with optional --no-ff; on conflict exits with clear message. Release/hotfix: merge to main then dev, create tag.
 * @module commands/finish
 */

import type { BranchType, ParsedArgs } from "../types.js";
import { EXIT_USER, VERSION_REGEX } from "../constants.js";
import {
  getBranchTypeMeta,
  getPrefixForType,
  resolveConfig,
} from "../config.js";
import { BranchNotFoundError } from "../errors.js";
import {
  assertNoRebaseOrMerge,
  assertNotDetached,
  branchList,
  checkout,
  deleteBranch,
  getCurrentBranch,
  merge,
  push,
  resolveRepoRoot,
  tag,
  tagExists,
} from "../git.js";

/** Normalizes version to vX.Y.Z for tag name. */
function normalizeTagVersion(version: string): string {
  const v = version.trim();
  return v.startsWith("v") ? v : `v${v}`;
}

/**
 * Returns workflow branches (local) that match any configured prefix.
 */
async function getWorkflowBranches(
  cwd: string,
  prefixes: Record<BranchType, string>
): Promise<string[]> {
  const all = await branchList(cwd, { dryRun: false, verbose: false });
  const workflow: string[] = [];
  for (const b of all) {
    for (const prefix of Object.values(prefixes)) {
      if (b.startsWith(prefix)) {
        workflow.push(b);
        break;
      }
    }
  }
  return workflow.sort();
}

/**
 * Infers branch type and optional version from branch name using config prefixes.
 */
function parseBranchTypeAndVersion(
  branchName: string,
  prefixes: Record<BranchType, string>
): { type: BranchType; version?: string } | null {
  for (const type of [
    "release",
    "hotfix",
    "feature",
    "bugfix",
    "chore",
    "spike",
  ] as BranchType[]) {
    const prefix = prefixes[type];
    if (prefix && branchName.startsWith(prefix)) {
      const suffix = branchName.slice(prefix.length);
      if (type === "release" || type === "hotfix") {
        const ver = suffix.trim();
        return VERSION_REGEX.test(ver) ? { type, version: ver } : { type };
      }
      return { type };
    }
  }
  return null;
}

/**
 * Runs the finish command: resolve branch, run pre-checks, merge to target(s), optional tag/delete/push.
 * Pre-checks: repo, not detached HEAD, no rebase/merge, branch is not main/dev; for release/hotfix tag must not exist.
 *
 * @param args - Parsed CLI args (cwd, type, branch, push, noPush, remote, dryRun, verbose, quiet, yes, noFf, deleteAfterFinish, noDeleteAfterFinish, signTag, noTag, tagMessage).
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose }
  );

  const opts: { dryRun: boolean; verbose: boolean } = {
    dryRun: args.dryRun,
    verbose: args.verbose,
  };

  const isTTY = Boolean(process.stdin.isTTY);

  // Resolve branch to finish (and guard main/dev early so we can error before picker)
  let branchToFinish: string;
  const explicitBranch =
    typeof args.branch === "string" && args.branch.trim() !== ""
      ? args.branch.trim()
      : undefined;

  if (explicitBranch) {
    branchToFinish = explicitBranch;
  } else if (isTTY) {
    const workflow = await getWorkflowBranches(repoRoot, config.prefixes);
    if (workflow.length === 0) {
      console.error("gflows finish: no workflow branches found.");
      process.exit(EXIT_USER);
    }
    const { select } = await import("@inquirer/prompts");
    branchToFinish = await select({
      message: "Branch to finish",
      choices: workflow.map((b) => ({ name: b, value: b })),
    });
  } else {
    const current = await getCurrentBranch(repoRoot, opts);
    if (!current) {
      console.error(
        "gflows finish: HEAD is detached. Checkout a branch or specify one with -B <name>."
      );
      process.exit(EXIT_USER);
    }
    branchToFinish = current;
  }

  // Refuse finish on main or dev
  if (branchToFinish === config.main || branchToFinish === config.dev) {
    console.error(
      `gflows finish: cannot finish the long-lived branch '${branchToFinish}'. Finish a workflow branch (feature, bugfix, etc.) instead.`
    );
    process.exit(2);
  }

  // Infer type from branch name (or use args.type if provided and consistent)
  const parsed = parseBranchTypeAndVersion(branchToFinish, config.prefixes);
  const type: BranchType | undefined = args.type ?? parsed?.type ?? undefined;
  if (!type) {
    console.error(
      `gflows finish: cannot determine branch type for '${branchToFinish}'. Specify type (e.g. gflows finish feature) or use a branch name with a known prefix.`
    );
    process.exit(EXIT_USER);
  }
  if (parsed && parsed.type !== type) {
    console.error(
      `gflows finish: branch '${branchToFinish}' matches type '${parsed.type}', but '${type}' was specified.`
    );
    process.exit(EXIT_USER);
  }

  const meta = getBranchTypeMeta(type);
  const version = parsed?.version;

  // Pre-checks: not detached, no rebase/merge
  await assertNotDetached(repoRoot);
  assertNoRebaseOrMerge(repoRoot);

  // For release/hotfix: tag must not already exist
  if (meta.tagOnFinish && version) {
    const tagName = normalizeTagVersion(version);
    const exists = await tagExists(repoRoot, tagName, opts);
    if (exists) {
      console.error(`gflows finish: tag '${tagName}' already exists.`);
      process.exit(2);
    }
  } else if (meta.tagOnFinish && !version) {
    console.error(
      `gflows finish: release/hotfix branch '${branchToFinish}' has no valid version segment. Use format release/vX.Y.Z or hotfix/vX.Y.Z.`
    );
    process.exit(EXIT_USER);
  }

  // Ensure the branch we're finishing exists (e.g. if -B was used)
  const branches = await branchList(repoRoot, { ...opts, dryRun: false });
  if (!branches.includes(branchToFinish)) {
    throw new BranchNotFoundError(
      `Branch '${branchToFinish}' not found. Specify an existing local branch with -B <name>.`
    );
  }

  const noFf = args.noFf;

  try {
    if (meta.mergeTarget === "dev") {
      await checkout(repoRoot, config.dev, opts);
      await merge(repoRoot, branchToFinish, { ...opts, noFf });
    } else {
      // main-then-dev: merge into main first, then merge main into dev
      await checkout(repoRoot, config.main, opts);
      await merge(repoRoot, branchToFinish, { ...opts, noFf });

      if (meta.tagOnFinish && version && !args.noTag) {
        const tagName = normalizeTagVersion(version);
        await tag(repoRoot, tagName, {
          ...opts,
          sign: args.signTag,
          tagMessage: args.tagMessage,
        });
        if (!args.quiet && !args.dryRun) {
          console.error(`gflows: created tag '${tagName}'.`);
        }
      }

      await checkout(repoRoot, config.dev, opts);
      await merge(repoRoot, config.main, { ...opts, noFf });
    }
  } catch (err) {
    throw err;
  }

  // Optional: delete the finished branch
  let shouldDelete = args.deleteAfterFinish;
  if (!args.deleteAfterFinish && !args.noDeleteAfterFinish) {
    if (args.yes) {
      shouldDelete = false;
    } else if (isTTY) {
      const { confirm } = await import("@inquirer/prompts");
      shouldDelete = await confirm({
        message: "Delete branch after finish?",
        default: false,
      });
    }
  }
  if (args.noDeleteAfterFinish) {
    shouldDelete = false;
  }

  if (shouldDelete && !opts.dryRun) {
    await deleteBranch(repoRoot, branchToFinish, opts);
    if (!args.quiet) {
      console.error(`gflows: deleted branch '${branchToFinish}'.`);
    }
  }

  const doPush = args.push && !args.noPush;
  const didCreateTag = !!(
    meta.mergeTarget === "main-then-dev" && meta.tagOnFinish && version && !args.noTag
  );
  if (doPush) {
    const remote = args.remote ?? config.remote;
    const refsToPush: string[] = [config.dev];
    if (meta.mergeTarget === "main-then-dev") {
      refsToPush.push(config.main);
    }
    const pushCode = await push(
      repoRoot,
      remote,
      refsToPush,
      didCreateTag,
      opts
    );
    if (pushCode !== 0) {
      console.error(
        "gflows: merge and tag succeeded locally, but push failed. Retry with `git push` or `gflows finish ... --push`."
      );
      process.exit(2);
    }
    if (!args.quiet && !args.dryRun) {
      console.error(`gflows: pushed to ${remote}.`);
    }
  }

  if (!args.quiet && !args.dryRun) {
    console.error(`gflows: finished '${branchToFinish}' into ${meta.mergeTarget}.`);
  }
}
