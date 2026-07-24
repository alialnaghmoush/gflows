/**
 * Undo the last completed gflows operation when reversible.
 * @module commands/undo
 */

import { EXIT_USER } from "../constants.js";
import { checkout, deleteTag, resolveRepoRoot, runGit, tagExists } from "../git.js";
import { hint, success } from "../out.js";
import { clearLastRun, readLastRun } from "../run-state.js";
import type { ParsedArgs } from "../types.js";

/**
 * Best-effort undo of the last completed gflows command.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const last = readLastRun(repoRoot);
  if (last?.status !== "completed") {
    console.error("gflows undo: nothing to undo.");
    process.exit(EXIT_USER);
  }

  const opts = { dryRun: args.dryRun, verbose: args.verbose };
  const undo = last.undo;

  if (last.command === "finish") {
    const createdTag = typeof undo.createdTag === "string" ? undo.createdTag : null;
    const mainName = typeof undo.main === "string" ? undo.main : "main";
    const devName = typeof undo.dev === "string" ? undo.dev : "dev";
    const branchName = typeof undo.branchName === "string" ? undo.branchName : null;
    const branchSha = typeof undo.branchSha === "string" ? undo.branchSha : null;
    const prevBranch = typeof undo.prevBranch === "string" ? undo.prevBranch : null;

    if (createdTag && (await tagExists(repoRoot, createdTag, opts))) {
      await deleteTag(repoRoot, createdTag, opts);
      if (!args.quiet) success(`gflows: deleted tag '${createdTag}'.`);
    }

    if (typeof undo.mainSha === "string") {
      await runGit(["branch", "-f", mainName, undo.mainSha], { cwd: repoRoot, ...opts });
    }
    if (typeof undo.devSha === "string") {
      await runGit(["branch", "-f", devName, undo.devSha], { cwd: repoRoot, ...opts });
    }

    if (branchName && branchSha && undo.shouldDelete) {
      await runGit(["branch", branchName, branchSha], { cwd: repoRoot, ...opts });
      if (!args.quiet) success(`gflows: restored branch '${branchName}'.`);
    }

    if (prevBranch) {
      await checkout(repoRoot, prevBranch, opts).catch(() => undefined);
    }

    clearLastRun(repoRoot);
    if (!args.quiet) {
      success("gflows: undid last finish (best effort). Remote was not modified.");
    }
    hint("If you had pushed, reset remotes manually.");
    return;
  }

  if (last.command === "sync") {
    const branch = typeof undo.branch === "string" ? undo.branch : null;
    const beforeSha = typeof undo.beforeSha === "string" ? undo.beforeSha : null;
    if (branch && beforeSha) {
      await runGit(["checkout", branch], { cwd: repoRoot, ...opts });
      await runGit(["reset", "--hard", beforeSha], { cwd: repoRoot, ...opts });
      clearLastRun(repoRoot);
      if (!args.quiet) success(`gflows: reset '${branch}' to pre-sync state.`);
      return;
    }
  }

  console.error(`gflows undo: cannot undo command '${last.command}' automatically.`);
  hint("Inspect .git/gflows/last.json and recover with git reflog if needed.");
  process.exit(EXIT_USER);
}
