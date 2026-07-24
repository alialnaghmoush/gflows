/**
 * Start command: create a workflow branch from the appropriate base.
 * Ensures clean tree (or --force), base exists (local or after fetch), creates type/name branch, optional push.
 * @module commands/start
 */

import { getPrefixForType, resolveConfig } from "../config.js";
import { EXIT_USER, VERSION_REGEX } from "../constants.js";
import {
  BranchExistsError,
  BranchNotFoundError,
  DirtyWorkingTreeError,
  InvalidVersionError,
} from "../errors.js";
import { getBaseBranchName } from "../flow.js";
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
import { promptStartArgs } from "../interactive.js";
import { hint, success } from "../out.js";
import type { ParsedArgs } from "../types.js";

/**
 * Runs the start command: validate pre-conditions, ensure base exists, create branch, optional push.
 */
export async function run(args: ParsedArgs): Promise<void> {
  let type = args.type;
  let name = args.name?.trim();

  if ((!type || !name) && process.stdin.isTTY) {
    const prompted = await promptStartArgs();
    type = type ?? prompted.type;
    name = name || prompted.name;
  }

  if (!type || name === undefined || name === "") {
    console.error(
      "gflows start: requires type and name (e.g. gflows start feature my-feat). Use 'gflows help' for usage.",
    );
    process.exit(EXIT_USER);
  }

  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );

  const opts = {
    dryRun: args.dryRun,
    verbose: args.verbose,
  };

  await assertNotDetached(repoRoot);
  assertNoRebaseOrMerge(repoRoot);

  if (!args.force) {
    const clean = await isClean(repoRoot, { dryRun: false, verbose: opts.verbose });
    if (!clean) {
      throw new DirtyWorkingTreeError();
    }
  }

  if (type === "release" || type === "hotfix") {
    if (!VERSION_REGEX.test(name)) {
      throw new InvalidVersionError(
        `Invalid version '${name}'. Use format vX.Y.Z or X.Y.Z (e.g. v1.2.0).`,
      );
    }
  } else {
    validateBranchName(name);
  }

  const fromMain =
    args.fromMain ||
    (typeof args.from === "string" && (args.from === config.main || args.from === "main"));

  const base =
    typeof args.from === "string" && args.from !== "main" && args.from !== config.main
      ? args.from
      : getBaseBranchName(type, fromMain, config);

  try {
    await revParse(repoRoot, base, [], { dryRun: false, verbose: opts.verbose });
  } catch {
    await fetch(repoRoot, config.remote, opts);
    const remoteRef = `${config.remote}/${base}`;
    try {
      await revParse(repoRoot, remoteRef, [], { dryRun: false, verbose: opts.verbose });
      if (!opts.dryRun) {
        await runGit(["branch", base, remoteRef], { cwd: repoRoot, ...opts, dryRun: false });
      }
    } catch {
      throw new BranchNotFoundError(
        `Base branch '${base}' not found locally or on ${config.remote}. Create it or push it first.`,
      );
    }
  }

  const prefix = getPrefixForType(config, type);
  const fullBranchName = `${prefix}${name}`;

  const branches = await branchList(repoRoot, { ...opts, dryRun: false });
  if (branches.includes(fullBranchName)) {
    throw new BranchExistsError(
      `Branch '${fullBranchName}' already exists.`,
      `Use a different name, or: gflows switch ${fullBranchName}`,
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
        `Push failed. Local branch '${fullBranchName}' was created. Retry with \`git push ${remote} ${fullBranchName}\` or \`gflows start ... --push\`.`,
      );
    }
    if (!args.quiet && !args.dryRun) {
      success(`gflows: pushed '${fullBranchName}' to '${remote}'.`);
    }
  }

  if (!args.quiet && !args.dryRun) {
    hint(
      `Commit your work, then gflows sync or gflows finish ${type}. Interactive: just run gflows`,
    );
  }
}
