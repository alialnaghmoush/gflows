/**
 * Abort a suspended gflows operation and clear merge/rebase state when present.
 * @module commands/abort
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { isRebaseOrMergeInProgress, mergeAbort, rebaseAbort, resolveRepoRoot } from "../git.js";
import { hint, success } from "../out.js";
import { clearActiveRun, readActiveRun } from "../run-state.js";
import type { ParsedArgs } from "../types.js";

/**
 * Aborts the suspended run and any in-progress git merge/rebase.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const state = readActiveRun(repoRoot);
  const opts = { dryRun: args.dryRun, verbose: args.verbose };

  if (isRebaseOrMergeInProgress(repoRoot)) {
    const root = join(repoRoot, ".git");
    if (existsSync(join(root, "MERGE_HEAD"))) {
      await mergeAbort(repoRoot, opts);
    } else if (existsSync(join(root, "rebase-merge")) || existsSync(join(root, "rebase-apply"))) {
      await rebaseAbort(repoRoot, opts);
    }
  }

  if (state) {
    clearActiveRun(repoRoot);
    if (!args.quiet) {
      success(`gflows: aborted suspended '${state.command}' operation.`);
    }
  } else if (!args.quiet) {
    success("gflows: no suspended operation; cleared any merge/rebase in progress.");
  }
  hint("Repository should be ready for a new gflows command.");
}
