/**
 * List command: list workflow branches using resolved config prefixes;
 * optional type filter and -r/--include-remote for remote-tracking branches.
 * Script-friendly: one branch per line to stdout.
 * @module commands/list
 */

import { resolveConfig } from "../config.js";
import { NotRepoError } from "../errors.js";
import { branchList, fetch, resolveRepoRoot } from "../git.js";
import { hint } from "../out.js";
import type { BranchType, ParsedArgs, ResolvedConfig } from "../types.js";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/**
 * Returns branch names that match any workflow prefix. If typeFilter is set,
 * only branches with that type's prefix are included. Excludes main and dev.
 */
function filterWorkflowBranches(
  allBranches: string[],
  config: ResolvedConfig,
  typeFilter: BranchType | undefined,
): string[] {
  const { main, dev, prefixes } = config;
  const prefixesToMatch =
    typeFilter !== undefined ? [prefixes[typeFilter]] : BRANCH_TYPES.map((t) => prefixes[t]);

  return allBranches.filter((b) => {
    if (b === main || b === dev) return false;
    return prefixesToMatch.some((p) => p && b.startsWith(p));
  });
}

/**
 * Runs the list command.
 * Lists workflow branches (matching config prefixes), optionally filtered by type
 * and optionally including remote-tracking branches (-r/--include-remote).
 * When includeRemote is true, fetches from the configured remote first so refs are up to date.
 * Output: one branch per line to stdout (script-friendly).
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, type: typeFilter, includeRemote, dryRun, verbose, quiet } = args;

  const root = await resolveRepoRoot(cwd).catch((err: unknown) => {
    if (err instanceof NotRepoError) throw err;
    throw err;
  });

  const config = resolveConfig(
    root,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: !!verbose },
  );

  if (includeRemote && !dryRun) {
    await fetch(root, config.remote, {
      verbose: !!verbose,
    });
  }

  const allBranches = await branchList(root, {
    includeRemote: includeRemote ?? false,
    dryRun: !!dryRun,
    verbose: !!verbose,
  });

  const workflowBranches = filterWorkflowBranches(allBranches, config, typeFilter);

  // Show main and dev first (when present), then workflow branches
  const mainAndDev = [config.main, config.dev].filter((b) => allBranches.includes(b));
  const sorted = [...mainAndDev, ...[...workflowBranches].sort()];

  for (const b of sorted) {
    console.log(b);
  }

  if (!quiet && sorted.length > 0) {
    // Hint: suggest switching to a listed branch
    hint("Use gflows switch <branch> to switch to a branch.");
  }
}
