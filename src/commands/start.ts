/**
 * Start command: create a workflow branch from the appropriate base.
 * Ensures clean tree (or --force), base exists (local or after fetch), creates type/name branch, optional push.
 * @module commands/start
 */

import type { BranchType, ParsedArgs } from "../types.js";
import { EXIT_USER, VERSION_REGEX } from "../constants.js";
import { getPrefixForType, resolveConfig } from "../config.js";
import { BranchNotFoundError, DirtyWorkingTreeError, InvalidVersionError } from "../errors.js";
import { hint, success } from "../out.js";
import {
  assertNoRebaseOrMerge,
  assertNotDetached,
  branchList,
  fetch,
  isClean,
  push,
  resolveRepoRoot,
  revParse,
  runGit,
  validateBranchName,
} from "../git.js";

/**
 * Returns the base branch name for the given type and fromMain flag (main vs dev).
 */
function getBaseBranch(
  type: BranchType,
  fromMain: boolean,
  main: string,
  dev: string
): string {
  if (type === "hotfix") return main;
  if (type === "bugfix" && fromMain) return main;
  return dev;
}

/**
 * Runs the start command: validate pre-conditions, ensure base exists, create branch, optional push.
 * Pre-checks: repo is git, not detached HEAD, no rebase/merge in progress, working tree clean (or --force), base exists.
 * Requires type and name (exit 1 if missing). For release/hotfix, name must match vX.Y.Z or X.Y.Z.
 *
 * @param args - Parsed CLI args (cwd, type, name, push, noPush, remote, dryRun, verbose, quiet, force, fromMain).
 */
export async function run(args: ParsedArgs): Promise<void> {
  if (!args.type || args.name === undefined || args.name === "") {
    console.error("gflows start: requires type and name (e.g. gflows start feature my-feat). Use 'gflows help' for usage.");
    process.exit(EXIT_USER);
  }

  const type = args.type;
  const name = args.name.trim();
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose }
  );

  const opts = {
    dryRun: args.dryRun,
    verbose: args.verbose,
  };

  // Pre-checks: not detached HEAD, no rebase/merge in progress
  await assertNotDetached(repoRoot);
  assertNoRebaseOrMerge(repoRoot);

  // Working tree clean or --force
  if (!args.force) {
    const clean = await isClean(repoRoot, { dryRun: false, verbose: opts.verbose });
    if (!clean) {
      throw new DirtyWorkingTreeError();
    }
  }

  // Validate name: version for release/hotfix, branch name for others
  if (type === "release" || type === "hotfix") {
    if (!VERSION_REGEX.test(name)) {
      throw new InvalidVersionError(
        `Invalid version '${name}'. Use format vX.Y.Z or X.Y.Z (e.g. v1.2.0).`
      );
    }
  } else {
    validateBranchName(name);
  }

  const base = getBaseBranch(type, args.fromMain, config.main, config.dev);

  // Ensure base exists (local or create from remote after fetch)
  let baseExists = false;
  try {
    await revParse(repoRoot, base, [], { dryRun: false, verbose: opts.verbose });
    baseExists = true;
  } catch {
    // Fetch and try remote ref
    await fetch(repoRoot, config.remote, opts);
    const remoteRef = `${config.remote}/${base}`;
    try {
      await revParse(repoRoot, remoteRef, [], { dryRun: false, verbose: opts.verbose });
      if (!opts.dryRun) {
        await runGit(["branch", base, remoteRef], { cwd: repoRoot, ...opts, dryRun: false });
      }
      baseExists = true;
    } catch {
      throw new BranchNotFoundError(
        `Base branch '${base}' not found locally or on ${config.remote}. Create it or push it first.`
      );
    }
  }

  const prefix = getPrefixForType(config, type);
  const fullBranchName = `${prefix}${name}`;

  const branches = await branchList(repoRoot, { ...opts, dryRun: false });
  if (branches.includes(fullBranchName)) {
    throw new BranchNotFoundError(
      `Branch '${fullBranchName}' already exists. Use a different name or switch to it.`
    );
  }

  await runGit(["checkout", "-b", fullBranchName, base], { cwd: repoRoot, ...opts });

  if (!args.quiet && !args.dryRun) {
    success(`gflows: created and checked out branch '${fullBranchName}' from '${base}'.`);
  }

  const doPush = args.push && !args.noPush;
  if (doPush) {
    const remote = args.remote ?? config.remote;
    const pushCode = await push(repoRoot, remote, [fullBranchName], false, opts);
    if (pushCode !== 0) {
      throw new Error(
        `Push failed. Local branch '${fullBranchName}' was created. Retry with \`git push ${remote} ${fullBranchName}\` or \`gflows start ... --push\`.`
      );
    }
    if (!args.quiet && !args.dryRun) {
      success(`gflows: pushed '${fullBranchName}' to '${remote}'.`);
    }
  }

  if (!args.quiet && !args.dryRun) {
    hint(`When done, run gflows finish ${type} to merge into the target branch.`);
  }
}
