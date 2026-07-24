/**
 * Continue a suspended gflows multi-step operation after resolving conflicts.
 * @module commands/continue
 */

import { EXIT_USER } from "../constants.js";
import { resolveRepoRoot } from "../git.js";
import { hint } from "../out.js";
import { readActiveRun } from "../run-state.js";
import type { ParsedArgs } from "../types.js";
import { executeFinishSteps } from "./finish.js";

/**
 * Resumes the active suspended run (finish, sync, …).
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const state = readActiveRun(repoRoot);
  if (!state || (state.status !== "suspended" && state.status !== "running")) {
    console.error("gflows continue: no suspended operation to continue.");
    hint("If you hit a merge conflict during finish/sync, resolve it, then retry continue.");
    process.exit(EXIT_USER);
  }

  const opts = { dryRun: args.dryRun, verbose: args.verbose, quiet: args.quiet };

  if (state.command === "finish") {
    await executeFinishSteps(repoRoot, state, opts);
    return;
  }

  if (state.command === "sync") {
    const { executeSyncSteps } = await import("./sync.js");
    await executeSyncSteps(repoRoot, state, opts);
    return;
  }

  console.error(`gflows continue: unknown suspended command '${state.command}'.`);
  process.exit(EXIT_USER);
}
