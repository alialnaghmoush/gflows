/**
 * Switch command: switch to a workflow branch (picker when TTY and no name, else branch name).
 * @module commands/switch
 */

import type { BranchType } from "../types.js";
import type { ParsedArgs } from "../types.js";
import { resolveConfig } from "../config.js";
import { EXIT_OK, EXIT_USER } from "../constants.js";
import { NotRepoError } from "../errors.js";
import {
  branchList,
  checkout,
  resolveRepoRoot,
} from "../git.js";
import { hint, success } from "../out.js";

const BRANCH_TYPES: BranchType[] = [
  "feature",
  "bugfix",
  "chore",
  "release",
  "hotfix",
  "spike",
];

/**
 * Returns local branch names that match any workflow prefix (feature/, bugfix/, etc.).
 */
function getWorkflowBranches(
  allBranches: string[],
  prefixes: Record<BranchType, string>
): string[] {
  const prefixed = BRANCH_TYPES.map((t) => prefixes[t]).filter(Boolean);
  return allBranches.filter((b) =>
    prefixed.some((p) => p && b.startsWith(p))
  );
}

/**
 * Run the switch command.
 * With a branch name (positional or -B): checkout that branch.
 * With no name and TTY: show a select picker of workflow branches; if none, exit 0 with message.
 * With no name and not TTY: exit 1 with message to provide a branch name.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, name, branch, dryRun, quiet } = args;

  const root = await resolveRepoRoot(cwd).catch((err) => {
    if (err instanceof NotRepoError) throw err;
    throw err;
  });
  const config = resolveConfig(root, {
    main: args.main,
    dev: args.dev,
    remote: args.remote,
  });

  const branchName = (branch?.trim() || name?.trim() || "").trim() || undefined;

  if (branchName) {
    await checkout(root, branchName, {
      dryRun,
      verbose: args.verbose,
    });
    if (!quiet && !dryRun) {
      success(`Switched to branch '${branchName}'.`);
      hint("Use gflows list to see all workflow branches.");
    }
    return;
  }

  const isTTY = typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;
  if (!isTTY) {
    console.error(
      "gflows switch: no branch name given and stdin is not a TTY. Pass a branch name (e.g. gflows switch feature/my-branch) or run from an interactive terminal."
    );
    process.exit(EXIT_USER);
  }

  const allLocal = await branchList(root, { dryRun, verbose: args.verbose });
  const workflowBranches = getWorkflowBranches(allLocal, config.prefixes);

  if (workflowBranches.length === 0) {
    if (!quiet) {
      console.error("No workflow branches found. Create one with 'gflows start <type> <name>'.");
    }
    process.exit(EXIT_OK);
  }

  const { select } = await import("@inquirer/prompts");
  const chosen = await select({
    message: "Switch to branch",
    choices: workflowBranches.map((b) => ({ name: b, value: b })),
  });

  if (typeof chosen !== "string") {
    process.exit(EXIT_USER);
  }

  await checkout(root, chosen, {
    dryRun,
    verbose: args.verbose,
  });
  if (!quiet && !dryRun) {
    success(`Switched to branch '${chosen}'.`);
    hint("Use gflows list to see all workflow branches.");
  }
}
