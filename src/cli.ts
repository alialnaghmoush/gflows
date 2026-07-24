#!/usr/bin/env bun

/**
 * CLI entrypoint for gflows. Parses argv, resolves -C/path, dispatches to commands,
 * and ensures exit codes and unhandled rejections are handled.
 * @module cli
 */

import { EXIT_GIT, EXIT_OK, EXIT_USER } from "./constants.js";
import { exitCodeForError, printError } from "./errors.js";
import { parse } from "./parse.js";
import { PromptCancelledError } from "./prompts.js";
import type { ParsedArgs } from "./types.js";

/** Last parsed args, set at start of run(); used by catch/rejection to respect -v for stack trace. */
let lastParsedArgs: ParsedArgs | null = null;

export { parse } from "./parse.js";

/** Run the CLI: parse, dispatch, set exit code. */
async function run(): Promise<void> {
  const rawArgv = Bun.argv.slice(2);
  const isTTY = Boolean(process.stdin.isTTY);

  if (rawArgv.length === 0) {
    if (isTTY) {
      const { runHub } = await import("./interactive.js");
      await runHub(process.cwd());
      return;
    }
    console.error(
      "gflows: no interactive TTY. Run `gflows` directly (or `alias g=gflows`), not via a bun/npm script that swallows stdin.",
    );
    console.error("Or pass a command: gflows help");
    process.exit(EXIT_USER);
  }

  const args = parse();
  lastParsedArgs = args;

  if (args.command === "help") {
    const { run: runHelp } = await import("./commands/help.js");
    await runHelp(args);
    return;
  }
  if (args.command === "version") {
    const { run: runVersion } = await import("./commands/version.js");
    await runVersion(args);
    return;
  }

  const mod = await import(`./commands/${args.command}.js`).catch(() => null);
  if (!mod || typeof mod.run !== "function") {
    console.error(`gflows: command '${args.command}' is not implemented.`);
    process.exit(EXIT_GIT);
  }
  await mod.run(args);
}

function main(): void {
  let exitCode: number | null = null;

  const handleRejection = (reason: unknown): void => {
    if (exitCode !== null) return;
    printError(reason);
    const verbose = lastParsedArgs?.verbose ?? !!process.env.GFLOWS_VERBOSE;
    if (verbose && reason instanceof Error && reason.stack) {
      console.error(reason.stack);
    }
    exitCode = exitCodeForError(reason instanceof Error ? reason : new Error(String(reason)));
    process.exit(exitCode);
  };

  process.on("unhandledRejection", handleRejection);

  run()
    .then(() => {
      if (exitCode === null) exitCode = EXIT_OK;
      process.exit(exitCode);
    })
    .catch((err: unknown) => {
      if (exitCode !== null) return;
      if (err instanceof PromptCancelledError) {
        process.exit(EXIT_OK);
        return;
      }
      printError(err);
      const verbose = lastParsedArgs?.verbose ?? !!process.env.GFLOWS_VERBOSE;
      if (verbose && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      exitCode = exitCodeForError(err);
      process.exit(exitCode);
    });
}

main();
