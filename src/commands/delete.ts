/**
 * Delete command: delete local workflow branch(es). Guards main/dev; picker when TTY and no names.
 * @module commands/delete
 */

import type { BranchType } from "../types.js";
import type { ParsedArgs } from "../types.js";
import { resolveConfig } from "../config.js";
import { EXIT_OK, EXIT_USER } from "../constants.js";
import { CannotDeleteMainOrDevError, NotRepoError } from "../errors.js";
import {
  branchList,
  deleteBranch,
  resolveRepoRoot,
} from "../git.js";

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
 * Run the delete command.
 * With branch name(s) as positionals: delete those branches (guard main/dev).
 * With no names and TTY: show a checkbox picker of workflow branches; if none, exit 1 with message.
 * With no names and not TTY: exit 1 with message to provide branch name(s).
 * Local delete only; never deletes main or dev.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, branchNames: rawBranchNames, dryRun, quiet } = args;

  const root = await resolveRepoRoot(cwd).catch((err) => {
    if (err instanceof NotRepoError) throw err;
    throw err;
  });
  const config = resolveConfig(root, {
    main: args.main,
    dev: args.dev,
    remote: args.remote,
  });
  const { main, dev, prefixes } = config;

  const fromPositionals = (rawBranchNames ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (fromPositionals.length > 0) {
    for (const branch of fromPositionals) {
      if (branch === main || branch === dev) {
        throw new CannotDeleteMainOrDevError(
          `Cannot delete the long-lived branch '${branch}'.`
        );
      }
    }
    for (const branch of fromPositionals) {
      await deleteBranch(root, branch, {
        dryRun,
        verbose: args.verbose,
      });
      if (!quiet && !dryRun) {
        console.error(`Deleted branch '${branch}'.`);
      }
    }
    return;
  }

  const isTTY = typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;
  if (!isTTY) {
    console.error(
      "gflows delete: no branch name(s) given and stdin is not a TTY. Pass branch name(s) (e.g. gflows delete feature/my-branch) or run from an interactive terminal."
    );
    process.exit(EXIT_USER);
  }

  const allLocal = await branchList(root, {
    dryRun,
    verbose: args.verbose,
  });
  const workflowBranches = getWorkflowBranches(allLocal, prefixes);

  if (workflowBranches.length === 0) {
    if (!quiet) {
      console.error(
        "No workflow branches to delete. Create one with 'gflows start <type> <name>'."
      );
    }
    process.exit(EXIT_USER);
  }

  const { checkbox } = await import("@inquirer/prompts");
  const chosen = await checkbox({
    message: "Delete branch(es)",
    choices: workflowBranches.map((b) => ({ name: b, value: b })),
  });

  if (!Array.isArray(chosen) || chosen.length === 0) {
    if (!quiet) {
      console.error("No branches selected.");
    }
    process.exit(EXIT_OK);
  }

  for (const branch of chosen) {
    if (branch === main || branch === dev) {
      throw new CannotDeleteMainOrDevError(
        `Cannot delete the long-lived branch '${branch}'.`
      );
    }
  }

  for (const branch of chosen) {
    await deleteBranch(root, branch, {
      dryRun,
      verbose: args.verbose,
    });
    if (!quiet && !dryRun) {
      console.error(`Deleted branch '${branch}'.`);
    }
  }
}
