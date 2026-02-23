/**
 * Status command: show current branch flow info.
 * Classifies branch (feature/bugfix/chore/release/hotfix/spike or unknown),
 * shows base and merge target(s), and optionally ahead/behind vs base.
 * No write operations.
 * @module commands/status
 */

import { getBranchTypeMeta, resolveConfig } from "../config.js";
import { NotRepoError } from "../errors.js";
import { getAheadBehind, getCurrentBranch, resolveRepoRoot } from "../git.js";
import { hint } from "../out.js";
import type { BranchType, ParsedArgs, ResolvedConfig } from "../types.js";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/**
 * Classifies a branch name into a workflow type, "main", "dev", or null (unknown).
 * Uses resolved config for main/dev names and prefixes.
 */
function classifyBranch(
  branchName: string,
  config: ResolvedConfig,
): BranchType | "main" | "dev" | null {
  if (branchName === config.main) return "main";
  if (branchName === config.dev) return "dev";
  const { prefixes } = config;
  for (const type of BRANCH_TYPES) {
    const prefix = prefixes[type];
    if (prefix && branchName.startsWith(prefix)) {
      return type;
    }
  }
  return null;
}

/**
 * Formats merge target for display (actual branch names).
 */
function formatMergeTarget(
  mergeTarget: "main" | "dev" | "main-then-dev",
  config: ResolvedConfig,
): string {
  if (mergeTarget === "main-then-dev") {
    return `${config.main}, then ${config.dev}`;
  }
  return mergeTarget === "main" ? config.main : config.dev;
}

/**
 * Runs the status command.
 * Shows current branch, classification, base, merge target(s), and ahead/behind vs base.
 * Output goes to stdout for scripts. On detached HEAD or non-repo, reports clearly and exits.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, dryRun, verbose, quiet } = args;

  const root = await resolveRepoRoot(cwd).catch((err: unknown) => {
    if (err instanceof NotRepoError) throw err;
    throw err;
  });

  const config = resolveConfig(
    root,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: !!verbose },
  );
  const current = await getCurrentBranch(root, {
    dryRun: !!dryRun,
    verbose: !!verbose,
  });

  if (current === null) {
    if (!quiet) {
      console.log("HEAD is detached.");
    }
    return;
  }

  const classification = classifyBranch(current, config);

  if (!quiet) {
    console.log(`Branch: ${current}`);
  }

  if (classification === "main") {
    if (!quiet) {
      console.log("Type: long-lived (main)");
    }
    return;
  }

  if (classification === "dev") {
    if (!quiet) {
      console.log("Type: long-lived (dev)");
    }
    return;
  }

  if (classification === null) {
    if (!quiet) {
      console.log("Type: unknown");
    }
    return;
  }

  const meta = getBranchTypeMeta(classification);
  const baseBranch = meta.base === "main" ? config.main : config.dev;
  const mergeTargetDisplay = formatMergeTarget(meta.mergeTarget, config);

  if (!quiet) {
    console.log(`Type: ${classification}`);
    console.log(`Base: ${baseBranch}`);
    console.log(`Merge target(s): ${mergeTargetDisplay}`);
  }

  const { ahead, behind } = await getAheadBehind(root, baseBranch, current, {
    dryRun: !!dryRun,
    verbose: !!verbose,
  });

  if (!quiet) {
    console.log(`Ahead/behind: ${ahead} ahead, ${behind} behind`);
    // Hint: suggest next step — finish current branch
    hint(`Run gflows finish ${classification} to merge into ${mergeTargetDisplay}.`);
  }
}
