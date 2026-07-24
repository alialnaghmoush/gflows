/**
 * Init command: ensure main exists, create dev from main, optional push and dry-run.
 * Can persist main, dev, and remote to .gflows.json via --main, --dev, --remote.
 * @module commands/init
 */

import { resolveConfig, writeConfigFile } from "../config.js";
import { BranchNotFoundError, NotRepoError } from "../errors.js";
import { branchList, push, resolveRepoRoot, revParse, runGit } from "../git.js";
import { banner, hint, success } from "../out.js";
import { ensureGflowsScriptAlias } from "../package-scripts.js";
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

  // TTY setup wizard when no explicit config flags
  let main = args.main;
  let dev = args.dev;
  let remote = args.remote;
  let scriptAlias = args.noScriptAlias ? undefined : args.scriptAlias;
  if (
    process.stdin.isTTY &&
    main === undefined &&
    dev === undefined &&
    remote === undefined &&
    !args.yes
  ) {
    const { confirmPrompt, inputPrompt, selectPrompt } = await import("../prompts.js");
    const defaults = resolveConfig(repoRoot, {}, { verbose: args.verbose });
    main = await inputPrompt({ message: "Main branch name", defaultValue: defaults.main });
    dev = await inputPrompt({ message: "Dev branch name", defaultValue: defaults.dev });
    remote = await inputPrompt({ message: "Remote name", defaultValue: defaults.remote });
    const persist = await confirmPrompt({ message: "Write .gflows.json?", initialValue: true });
    if (persist && !args.dryRun) {
      writeConfigFile(repoRoot, { main, dev, remote });
    }
    if (!args.noScriptAlias && scriptAlias === undefined) {
      const aliasChoice = await selectPrompt({
        message: "Add a short script in package.json? (shell alias is still nicer — see docs)",
        options: [
          {
            value: "g",
            label: '"g": "gflows"',
            hint: "bun run g -- start feature x",
          },
          {
            value: "gflows",
            label: '"gflows": "gflows"',
            hint: "bun run gflows -- …",
          },
          { value: "skip", label: "Skip", hint: "use a shell alias instead" },
        ],
        initialValue: "g",
      });
      scriptAlias = aliasChoice === "skip" ? undefined : aliasChoice;
    }
  }

  const config = resolveConfig(
    repoRoot,
    {
      main,
      dev,
      remote,
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
    const remotes = await runGit(["remote"], { cwd: repoRoot, ...opts });
    const hasRemote = remotes.stdout
      .split("\n")
      .map((s) => s.trim())
      .includes(config.remote);
    if (!hasRemote) {
      if (!args.quiet) {
        hint(
          `Remote '${config.remote}' not found — skipped push. Add a remote or re-run with --no-push.`,
        );
      }
    } else {
      const pushCode = await push(repoRoot, config.remote, [config.dev], false, opts);
      if (pushCode !== 0) {
        throw new Error(
          `Push failed. Local branch '${config.dev}' was created. Retry with \`git push ${config.remote} ${config.dev}\` or \`gflows init --no-push\`.`,
        );
      }
      if (!args.quiet && !args.dryRun) {
        success(`gflows: pushed '${config.dev}' to '${config.remote}'.`);
      }
    }
  }

  const hasConfigFlags = main !== undefined || dev !== undefined || remote !== undefined;
  if (!args.dryRun && hasConfigFlags) {
    writeConfigFile(repoRoot, {
      ...(main !== undefined && { main }),
      ...(dev !== undefined && { dev }),
      ...(remote !== undefined && { remote }),
    });
    if (!args.quiet) {
      success("gflows: updated .gflows.json with provided options.");
    }
  }

  if (scriptAlias && !args.noScriptAlias) {
    const result = ensureGflowsScriptAlias(repoRoot, scriptAlias, { dryRun: args.dryRun });
    if (!args.quiet) {
      if (result.status === "added") {
        success(
          args.dryRun
            ? `gflows: would add scripts["${result.name}"] = "gflows" to package.json.`
            : `gflows: added scripts["${result.name}"] = "gflows" to package.json.`,
        );
        hint(`Run with: bun run ${result.name} -- start feature <name>`);
        hint("Even shorter daily use: alias g=gflows  (or alias g='bunx gflows')");
      } else if (result.status === "unchanged") {
        hint(`package.json already has scripts["${result.name}"] → gflows.`);
      } else if (result.status === "conflict") {
        hint(`Skipped script alias: scripts["${result.name}"] is already "${result.existing}".`);
      } else if (result.status === "no-package") {
        hint("No package.json here — skipped script alias. Use: alias g=gflows");
      } else if (result.status === "invalid") {
        hint(`Invalid script alias name '${result.name}'. Use letters/numbers/_-: (e.g. g).`);
      }
    }
  } else if (!args.quiet) {
    hint("Tip: alias g=gflows in your shell, or re-run init with --script-alias g");
  }

  if (!args.quiet) {
    hint("Next: gflows start feature <name>");
  }
}
