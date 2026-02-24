/**
 * Switch command: switch to a workflow branch (picker when TTY and no name, else branch name).
 * @module commands/switch
 */

import { resolveConfig } from "../config.js";
import { EXIT_GIT, EXIT_OK, EXIT_USER } from "../constants.js";
import { NotRepoError } from "../errors.js";
import {
  branchList,
  checkout,
  cleanUntracked,
  findStashRefByBranch,
  findStashRefByMessage,
  getCurrentBranch,
  isClean,
  resolveRepoRoot,
  restoreTracked,
  stashDropRef,
  stashPopRef,
  stashPush,
  stashPushMove,
  STASH_SWITCH_MOVE_SUBSTRING,
} from "../git.js";
import { hint, success } from "../out.js";
import type { BranchType, ParsedArgs } from "../types.js";

/** User choice when switching with uncommitted changes. */
type SwitchWhenUncommitted = "cancel" | "restore" | "clean" | "move";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/**
 * Returns local branch names that match any workflow prefix (feature/, bugfix/, etc.).
 */
function getWorkflowBranches(
  allBranches: string[],
  prefixes: Record<BranchType, string>,
): string[] {
  const prefixed = BRANCH_TYPES.map((t) => prefixes[t]).filter(Boolean);
  return allBranches.filter((b) => prefixed.some((p) => p && b.startsWith(p)));
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
  const isTTY = typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;

  let targetBranch: string;

  if (branchName) {
    targetBranch = branchName;
  } else {
    if (!isTTY) {
      console.error(
        "gflows switch: no branch name given and stdin is not a TTY. Pass a branch name (e.g. gflows switch feature/my-branch) or run from an interactive terminal.",
      );
      process.exit(EXIT_USER);
    }

    const allLocal = await branchList(root, { dryRun, verbose: args.verbose });
    const workflowBranches = getWorkflowBranches(allLocal, config.prefixes);
    const mainAndDev = [config.main, config.dev].filter((b) => allLocal.includes(b));
    const choices = [...mainAndDev, ...workflowBranches];

    if (choices.length === 0) {
      if (!quiet) {
        console.error("No branches found.");
      }
      process.exit(EXIT_OK);
    }

    const { select } = await import("@inquirer/prompts");
    const chosen = await select({
      message: "Switch to branch",
      choices: choices.map((b) => ({ name: b, value: b })),
    });

    if (typeof chosen !== "string") {
      process.exit(EXIT_USER);
    }
    targetBranch = chosen;
  }

  const gitOpts = { dryRun, verbose: args.verbose };
  const treeClean = await isClean(root, gitOpts);
  let whenUncommitted: SwitchWhenUncommitted;

  if (args.switchMode !== undefined) {
    whenUncommitted = args.switchMode;
  } else if (!treeClean && isTTY) {
    const { select: selectPrompt } = await import("@inquirer/prompts");
    whenUncommitted = await selectPrompt({
      message: "Working tree has uncommitted changes. What do you want to do?",
      choices: [
        { name: "Cancel — Abort switching", value: "cancel" as const },
        {
          name: "Move changes to target — Take current changes with you to the target branch",
          value: "move" as const,
        },
        {
          name: "Restore — Save for this branch; switch; restore target's saved changes (if any)",
          value: "restore" as const,
        },
        {
          name: "Clean — Discard changes and switch to target clean at HEAD",
          value: "clean" as const,
        },
      ],
    });
  } else {
    whenUncommitted = "cancel";
  }

  if (whenUncommitted === "cancel") {
    if (!quiet) {
      console.error("Switch cancelled.");
    }
    process.exit(EXIT_USER);
  }

  if (!treeClean && whenUncommitted === "move") {
    await stashPushMove(root, gitOpts);
  }

  if (!treeClean && whenUncommitted === "restore") {
    const currentBranch = await getCurrentBranch(root, gitOpts);
    if (currentBranch) {
      const existingStashRef = await findStashRefByBranch(root, currentBranch, gitOpts);
      if (existingStashRef) {
        await stashDropRef(root, existingStashRef, gitOpts);
      }
      await stashPush(root, currentBranch, gitOpts);
    }
  }

  if (whenUncommitted === "clean") {
    const targetHasSavedState = await findStashRefByBranch(root, targetBranch, gitOpts);
    if (targetHasSavedState && !quiet) {
      console.error(
        "Warning: This branch has saved changes. Clean will not restore them and will open the branch at its last commit. Use \"Restore\" if you want to reapply the saved changes.",
      );
    }
    if (!treeClean) {
      await restoreTracked(root, gitOpts);
      await cleanUntracked(root, gitOpts);
    }
  }

  await checkout(root, targetBranch, gitOpts);

  if (whenUncommitted === "move") {
    const moveStashRef = await findStashRefByMessage(root, STASH_SWITCH_MOVE_SUBSTRING, gitOpts);
    if (moveStashRef) {
      try {
        await stashPopRef(root, moveStashRef, gitOpts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          "gflows switch: conflicts occurred while applying your changes on the target branch.",
        );
        console.error(
          "The stash was not dropped. Resolve conflicts, then commit or run `git stash drop` as needed.",
        );
        if (args.verbose && msg) console.error(msg);
        process.exit(EXIT_GIT);
      }
    }
  }

  if (whenUncommitted === "restore") {
    const targetStashRef = await findStashRefByBranch(root, targetBranch, gitOpts);
    if (targetStashRef) {
      try {
        await stashPopRef(root, targetStashRef, gitOpts);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        console.error(
          `gflows switch: conflicts occurred while restoring saved changes for '${targetBranch}'.`,
        );
        console.error(
          "The stash was not dropped. Resolve conflicts, then commit or run `git stash drop` as needed.",
        );
        if (args.verbose && msg) console.error(msg);
        process.exit(EXIT_GIT);
      }
    }
  }

  if (!quiet && !dryRun) {
    success(`Switched to branch '${targetBranch}'.`);
    hint("Use gflows list to see all workflow branches.");
  }
}
