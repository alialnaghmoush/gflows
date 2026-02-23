/**
 * Init command: ensure main exists, create dev from main, optional push and dry-run.
 * Can persist main, dev, and remote to .gflows.json via --main, --dev, --remote.
 * @module commands/init
 */

import { resolveConfig, writeConfigFile } from "../config.js";
import { BranchNotFoundError, NotRepoError } from "../errors.js";
import { branchList, push, resolveRepoRoot, revParse, runGit } from "../git.js";
import { banner, hint, success } from "../out.js";
import type { ParsedArgs } from "../types.js";

/**
 * Runs the init command: ensure main exists, create dev from main if missing, optional push.
 * Pre-check: cwd (or -C) must be a git repo; main branch must exist (exit 2 otherwise).
 * Skips creating dev if it already exists. Supports --dry-run and --push.
 * When --main, --dev, or --remote are passed, writes or updates .gflows.json with those values.
 *
 * @param args - Parsed CLI args (cwd, dryRun, push, noPush, main, dev, remote, verbose, quiet).
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    {
      main: args.main,
      dev: args.dev,
      remote: args.remote,
    },
    { verbose: args.verbose },
  );

  if (!args.quiet) {
    banner("gflows init", [
      "Setting up main + dev workflow",
      "",
      `  main   ${config.main}`,
      `  dev    ${config.dev}`,
      `  remote ${config.remote}`,
      "",
      "→ Dev from main. Use --no-push to skip pushing.",
    ]);
  }

  const opts = {
    dryRun: args.dryRun,
    verbose: args.verbose,
  };

  // Ensure main branch exists
  try {
    await revParse(repoRoot, config.main, [], { dryRun: false, verbose: opts.verbose });
  } catch (err) {
    if (err instanceof NotRepoError) throw err;
    if (err instanceof BranchNotFoundError) {
      throw new BranchNotFoundError(
        `Main branch '${config.main}' does not exist. Create an initial commit and the main branch first.`,
      );
    }
    throw err;
  }

  const branches = await branchList(repoRoot, { ...opts, dryRun: false });
  const devExists = branches.includes(config.dev);

  if (!devExists) {
    await runGit(["branch", config.dev, config.main], { cwd: repoRoot, ...opts });
    if (!args.quiet && !args.dryRun) {
      success(`gflows: created branch '${config.dev}' from '${config.main}'.`);
    }
  }

  const doPush = !args.noPush;
  if (doPush) {
    const pushCode = await push(repoRoot, config.remote, [config.dev], false, opts);
    if (pushCode !== 0) {
      throw new Error(
        `Push failed. Local branch '${config.dev}' was created. Retry with \`git push ${config.remote} ${config.dev}\` or \`gflows init\`.`,
      );
    }
    if (!args.quiet && !args.dryRun) {
      success(`gflows: pushed '${config.dev}' to '${config.remote}'.`);
    }
  }

  const hasConfigFlags =
    args.main !== undefined || args.dev !== undefined || args.remote !== undefined;
  if (!args.dryRun && hasConfigFlags) {
    writeConfigFile(repoRoot, {
      ...(args.main !== undefined && { main: args.main }),
      ...(args.dev !== undefined && { dev: args.dev }),
      ...(args.remote !== undefined && { remote: args.remote }),
    });
    if (!args.quiet) {
      success("gflows: updated .gflows.json with provided options.");
    }
  }

  if (!args.quiet) {
    // Hint: suggest next step — create first workflow branch
    hint("Run gflows start feature <name> to create a workflow branch.");
  }
}
