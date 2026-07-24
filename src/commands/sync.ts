/**
 * Sync command: update current workflow branch from its base (fetch + merge or rebase).
 * Stashes dirty work when needed; supports continue via run-state.
 * @module commands/sync
 */

import { getBranchTypeMeta, resolveConfig } from "../config.js";
import { EXIT_USER } from "../constants.js";
import { DirtyWorkingTreeError } from "../errors.js";
import { classifyBranch, getBaseBranchName } from "../flow.js";
import {
  assertNotDetached,
  fetch,
  getCurrentBranch,
  isClean,
  resolveRepoRoot,
  resolveSha,
  runGit,
  stashPopRef,
  stashPushMove,
} from "../git.js";
import { hint, success } from "../out.js";
import {
  completeRun,
  type GflowsRunState,
  startRun,
  suspendRun,
  writeActiveRun,
} from "../run-state.js";
import type { ParsedArgs } from "../types.js";

/**
 * Executes remaining sync steps (used by continue).
 */
export async function executeSyncSteps(
  repoRoot: string,
  state: GflowsRunState,
  opts: { dryRun: boolean; verbose: boolean; quiet: boolean },
): Promise<void> {
  let i = state.nextStep;
  while (i < state.steps.length) {
    const step = state.steps[i];
    if (!step) break;
    try {
      const base = String(state.context.base);
      const rebase = Boolean(state.context.rebase);
      if (step.id === "update") {
        if (rebase) {
          const r = await runGit(["rebase", base], { cwd: repoRoot, ...opts });
          if (r.exitCode !== 0) {
            throw new Error(`Rebase onto '${base}' conflicted.`);
          }
        } else {
          const r = await runGit(["merge", base], { cwd: repoRoot, ...opts });
          if (r.exitCode !== 0) {
            throw new Error(`Merge from '${base}' conflicted.`);
          }
        }
      } else if (step.id === "stash-pop") {
        const ref = typeof state.undo.stashRef === "string" ? state.undo.stashRef : null;
        if (ref) {
          await stashPopRef(repoRoot, ref, opts).catch(() => undefined);
        }
      }
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
    success(`gflows: synced with '${String(state.context.base)}'.`);
  }
}

/**
 * Runs sync on the current workflow branch.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );
  const opts = { dryRun: args.dryRun, verbose: args.verbose, quiet: args.quiet };

  await assertNotDetached(repoRoot);
  const current = await getCurrentBranch(repoRoot, opts);
  if (!current) {
    console.error("gflows sync: HEAD is detached.");
    process.exit(EXIT_USER);
  }

  const classification = classifyBranch(current, config);
  if (classification === "main" || classification === "dev") {
    // Allow updating long-lived from remote tracking
    await fetch(repoRoot, config.remote, opts);
    const remoteRef = `${config.remote}/${current}`;
    const r = await runGit(["merge", remoteRef], { cwd: repoRoot, ...opts });
    if (r.exitCode !== 0) {
      console.error(`gflows sync: could not update '${current}' from ${remoteRef}.`);
      process.exit(2);
    }
    if (!args.quiet) success(`gflows: updated '${current}' from ${remoteRef}.`);
    return;
  }
  if (classification === null) {
    console.error(`gflows sync: '${current}' is not a known workflow branch.`);
    hint("Use gflows start to create a typed branch, or checkout feature/bugfix/…");
    process.exit(EXIT_USER);
  }

  const fromMain = classification === "bugfix" && args.fromMain;
  const base = getBaseBranchName(classification, fromMain, config);
  // For bugfix-from-main detection on sync: if type is bugfix, prefer meta base unless fromMain
  const meta = getBranchTypeMeta(classification);
  const baseBranch =
    classification === "hotfix" || (classification === "bugfix" && args.fromMain)
      ? config.main
      : meta.base === "main"
        ? config.main
        : config.dev;

  await fetch(repoRoot, config.remote, opts);

  let stashed = false;
  const clean = await isClean(repoRoot, opts);
  if (!clean) {
    if (!args.force && !args.yes && !process.stdin.isTTY) {
      throw new DirtyWorkingTreeError(
        "Working tree dirty. Commit, stash, or pass --force to stash automatically during sync.",
      );
    }
    await stashPushMove(repoRoot, opts);
    stashed = true;
  }

  const beforeSha = await resolveSha(repoRoot, current, opts);
  const steps = [
    { id: "update", label: args.rebase ? `Rebase onto ${baseBranch}` : `Merge ${baseBranch}` },
    ...(stashed ? [{ id: "stash-pop", label: "Restore stash" }] : []),
  ];

  const state = startRun(
    repoRoot,
    "sync",
    steps,
    { base: baseBranch, rebase: args.rebase, branch: current },
    { beforeSha, branch: current, stashRef: stashed ? "stash@{0}" : null },
  );

  // Prefer configured base; ensure local base exists
  void base;
  await executeSyncSteps(repoRoot, state, opts);
}
