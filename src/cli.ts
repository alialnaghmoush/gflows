#!/usr/bin/env bun

/**
 * CLI entrypoint for gflows. Parses argv, resolves -C/path, dispatches to commands,
 * and ensures exit codes and unhandled rejections are handled.
 * @module cli
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { EXIT_GIT, EXIT_OK, EXIT_USER } from "./constants.js";
import { exitCodeForError } from "./errors.js";
import type { BranchType, Command, ParsedArgs } from "./types.js";

/** Last parsed args, set at start of run(); used by catch/rejection to respect -v for stack trace. */
let lastParsedArgs: ParsedArgs | null = null;

const COMMANDS: Command[] = [
  "init",
  "start",
  "finish",
  "switch",
  "delete",
  "list",
  "bump",
  "completion",
  "status",
  "help",
  "version",
];

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/** Short flag → command (when used as main command). */
const SHORT_TO_COMMAND: Record<string, Command> = {
  I: "init",
  S: "start",
  F: "finish",
  W: "switch",
  L: "delete",
  l: "list",
  t: "status",
  h: "help",
  V: "version",
};

function buildParseArgsOptions() {
  return {
    args: Bun.argv.slice(2),
    strict: false,
    allowPositionals: true,
    options: {
      // -C / --path (must be first conceptually for cwd resolution)
      path: { type: "string" as const, short: "C" },
      // Command shorts
      init: { type: "boolean" as const, short: "I" },
      start: { type: "boolean" as const, short: "S" },
      finish: { type: "boolean" as const, short: "F" },
      switch: { type: "boolean" as const, short: "W" },
      delete: { type: "boolean" as const, short: "L" },
      list: { type: "boolean" as const, short: "l" },
      status: { type: "boolean" as const, short: "t" },
      help: { type: "boolean" as const, short: "h" },
      version: { type: "boolean" as const, short: "V" },
      // Type shorts (-r is context-dependent: list → include-remote, start/finish → release)
      feature: { type: "boolean" as const, short: "f" },
      bugfix: { type: "boolean" as const, short: "b" },
      chore: { type: "boolean" as const, short: "c" },
      release: { type: "boolean" as const, short: "r" },
      hotfix: { type: "boolean" as const, short: "x" },
      spike: { type: "boolean" as const, short: "e" },
      // Common
      push: { type: "boolean" as const, short: "p" },
      noPush: { type: "boolean" as const, short: "P" },
      "no-push": { type: "boolean" as const },
      main: { type: "string" as const },
      dev: { type: "string" as const },
      remote: { type: "string" as const, short: "R" },
      from: { type: "string" as const, short: "o" },
      branch: { type: "string" as const, short: "B" },
      yes: { type: "boolean" as const, short: "y" },
      dryRun: { type: "boolean" as const, short: "d" },
      verbose: { type: "boolean" as const, short: "v" },
      quiet: { type: "boolean" as const, short: "q" },
      force: { type: "boolean" as const },
      // finish (-D/--delete-branch, -N/--no-delete)
      noFf: { type: "boolean" as const },
      deleteBranch: { type: "boolean" as const, short: "D" },
      noDelete: { type: "boolean" as const, short: "N" },
      sign: { type: "boolean" as const, short: "s" },
      noTag: { type: "boolean" as const, short: "T" },
      tagMessage: { type: "string" as const, short: "M" },
      message: { type: "string" as const, short: "m" },
      // list (-r is context-dependent: list → include-remote; start/finish → release)
      includeRemote: { type: "boolean" as const },
      "include-remote": { type: "boolean" as const },
    },
  };
}

/** Resolve -C/--path to absolute directory; validate it exists and is a directory. */
function resolveCwd(pathFlag: string | undefined): string {
  if (!pathFlag || pathFlag.trim() === "") {
    return process.cwd();
  }
  const absolute = resolve(process.cwd(), pathFlag.trim());
  if (!existsSync(absolute)) {
    console.error(`gflows: path does not exist: ${absolute}`);
    process.exit(EXIT_USER);
  }
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    console.error(`gflows: path is not a directory: ${absolute}`);
    process.exit(EXIT_USER);
  }
  return absolute;
}

/**
 * Returns the command name closest to `input` by edit distance, or undefined if no close match.
 * Used for "did you mean?" when the user mistypes a command.
 */
function closestCommand(input: string): Command | undefined {
  if (!input || input.length < 2) return undefined;
  const target = input.toLowerCase();
  let best: Command | undefined;
  let bestDistance = 3; // only suggest if within 2 edits
  for (const cmd of COMMANDS) {
    const d = editDistance(target, cmd);
    if (d < bestDistance) {
      bestDistance = d;
      best = cmd as Command;
    }
  }
  return best;
}

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v1 = dp[i - 1]?.[j] ?? 0;
      const v2 = dp[i]?.[j - 1] ?? 0;
      const v3 = dp[i - 1]?.[j - 1] ?? 0;
      const rowI = dp[i];
      if (rowI) rowI[j] = Math.min(v1 + 1, v2 + 1, v3 + cost);
    }
  }
  return dp[m]?.[n] ?? 0;
}

/** Resolve command from positionals and short flags. Short wins if both present. */
function resolveCommand(
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): Command | undefined {
  for (const [_short, cmd] of Object.entries(SHORT_TO_COMMAND)) {
    const key = cmd === "delete" ? "delete" : cmd;
    if (values[key] === true) return cmd as Command;
  }
  const first = positionals[0];
  if (first && COMMANDS.includes(first as Command)) {
    return first as Command;
  }
  return undefined;
}

/** Resolve branch type for start/finish/list. -r means release for start/finish; for list, -r means include-remote (handled in flags). */
function resolveType(
  command: Command,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): BranchType | undefined {
  if (command !== "start" && command !== "finish" && command !== "list") {
    return undefined;
  }
  // Type from short flags (for start/finish, -r => release)
  if (command === "list") {
    // For list, -r is include-remote only (see includeRemote below); type from other shorts or positional (not -r)
    if (values.feature === true) return "feature";
    if (values.bugfix === true) return "bugfix";
    if (values.chore === true) return "chore";
    if (values.hotfix === true) return "hotfix";
    if (values.spike === true) return "spike";
    // release type for list only via positional, e.g. "gflows list release"
  } else {
    // start / finish: -r => release
    if (values.release === true) return "release";
    if (values.feature === true) return "feature";
    if (values.bugfix === true) return "bugfix";
    if (values.chore === true) return "chore";
    if (values.hotfix === true) return "hotfix";
    if (values.spike === true) return "spike";
  }
  // Type from second positional
  const idx = positionals[0] && COMMANDS.includes(positionals[0] as Command) ? 1 : 0;
  const pos = positionals[idx];
  if (pos && BRANCH_TYPES.includes(pos as BranchType)) {
    return pos as BranchType;
  }
  return undefined;
}

/** Resolve name (third positional for start; -B for finish; first positional for completion). */
function resolveName(
  command: Command,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): string | undefined {
  const branch = values.branch;
  if (typeof branch === "string" && branch.trim() !== "") {
    return branch.trim();
  }
  const skip = positionals[0] && COMMANDS.includes(positionals[0] as Command) ? 1 : 0;
  if (command === "start") {
    const typeFromPos = positionals[skip] && BRANCH_TYPES.includes(positionals[skip] as BranchType);
    if (typeFromPos) {
      return positionals[skip + 1];
    }
    return positionals[skip];
  }
  if (command === "completion") {
    const shell = positionals[skip];
    if (shell === "bash" || shell === "zsh" || shell === "fish") return shell;
    return undefined;
  }
  if (command === "bump") {
    const dir = positionals[skip];
    const _typ = positionals[skip + 1];
    if (dir === "up" || dir === "down") {
      return dir;
    }
    return undefined;
  }
  if (command === "switch") {
    return positionals[skip];
  }
  return undefined;
}

/** Resolve bump direction and type from positionals (bump [up|down] [patch|minor|major]). */
function resolveBump(
  positionals: string[],
  _values: Record<string, string | boolean | undefined>,
): { direction?: "up" | "down"; type?: "patch" | "minor" | "major" } {
  const skip = positionals[0] === "bump" ? 1 : 0;
  const a = positionals[skip];
  const b = positionals[skip + 1];
  const direction = a === "up" || a === "down" ? a : undefined;
  const type = b === "patch" || b === "minor" || b === "major" ? b : undefined;
  return { direction, type };
}

/** Parse raw argv into ParsedArgs. Resolves -C first, then command/type/name and flags. */
export function parse(argv: string[] = Bun.argv.slice(2)): ParsedArgs {
  const config = {
    ...buildParseArgsOptions(),
    args: argv,
  };
  const { values, positionals } = parseArgs(config);
  const v = values as Record<string, string | boolean | undefined>;

  const pathRaw = v.path;
  const pathStr = typeof pathRaw === "string" ? pathRaw : undefined;
  const cwd = resolveCwd(pathStr);

  const command = resolveCommand(positionals, v);
  if (!command) {
    const first = positionals[0];
    const suggestion = typeof first === "string" ? closestCommand(first) : undefined;
    if (suggestion) {
      console.error(`gflows: unknown command '${first}'. Did you mean '${suggestion}'?`);
    } else {
      console.error("gflows: missing command. Use 'gflows help' for usage.");
    }
    process.exit(EXIT_USER);
  }

  const type = resolveType(command, positionals, v);
  const name = resolveName(command, positionals, v);
  const { direction: bumpDirection, type: bumpType } =
    command === "bump" ? resolveBump(positionals, v) : { direction: undefined, type: undefined };

  const branchNames =
    command === "delete"
      ? positionals[0] && COMMANDS.includes(positionals[0] as Command)
        ? positionals.slice(1)
        : positionals
      : undefined;

  // -r context: for list → includeRemote; for start/finish → already used as type release
  const includeRemote =
    command === "list"
      ? v.includeRemote === true || v["include-remote"] === true || v.release === true
      : false;

  let completionShell: "bash" | "zsh" | "fish" | undefined;
  if (command === "completion" && name === "bash") completionShell = "bash";
  else if (command === "completion" && name === "zsh") completionShell = "zsh";
  else if (command === "completion" && name === "fish") completionShell = "fish";

  return {
    command,
    cwd,
    type,
    name,
    completionShell,
    branchNames,
    bumpDirection,
    bumpType,
    push: v.push === true,
    noPush: v.noPush === true || v["no-push"] === true,
    main: typeof v.main === "string" && v.main.trim() !== "" ? v.main.trim() : undefined,
    dev: typeof v.dev === "string" && v.dev.trim() !== "" ? v.dev.trim() : undefined,
    remote: typeof v.remote === "string" ? v.remote : undefined,
    branch: typeof v.branch === "string" ? v.branch : undefined,
    yes: v.yes === true,
    dryRun: v.dryRun === true,
    verbose: v.verbose === true,
    quiet: v.quiet === true,
    force: v.force === true,
    path: pathStr,
    fromMain: v.from === "main",
    noFf: v.noFf === true,
    deleteAfterFinish: v.deleteBranch === true,
    noDeleteAfterFinish: v.noDelete === true,
    signTag: v.sign === true,
    noTag: v.noTag === true,
    tagMessage: typeof v.tagMessage === "string" ? v.tagMessage : undefined,
    message: typeof v.message === "string" ? v.message : undefined,
    includeRemote,
  };
}

/** Run the CLI: parse, dispatch, set exit code. */
async function run(): Promise<void> {
  const args = parse();
  lastParsedArgs = args;
  const { command } = args;

  if (command === "help") {
    const { run: runHelp } = await import("./commands/help.js");
    await runHelp(args);
    return;
  }
  if (command === "version") {
    const { run: runVersion } = await import("./commands/version.js");
    await runVersion(args);
    return;
  }

  const mod = await import(`./commands/${command}.js`).catch(() => null);
  if (!mod || typeof mod.run !== "function") {
    console.error(`gflows: command '${command}' is not implemented.`);
    process.exit(EXIT_GIT);
  }
  await mod.run(args);
}

// Top-level try/catch and unhandledRejection so exit code is always set
function main(): void {
  let exitCode: number | null = null;

  const handleRejection = (reason: unknown): void => {
    if (exitCode !== null) return;
    console.error("gflows:", reason instanceof Error ? reason.message : String(reason));
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
      console.error("gflows:", err instanceof Error ? err.message : String(err));
      const verbose = lastParsedArgs?.verbose ?? !!process.env.GFLOWS_VERBOSE;
      if (verbose && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      exitCode = exitCodeForError(err);
      process.exit(exitCode);
    });
}

main();
