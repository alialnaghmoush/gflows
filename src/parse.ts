/**
 * Argv parser for gflows. Resolves -C/path, command, type, name, and flags.
 * @module parse
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { EXIT_USER } from "./constants.js";
import type { BranchType, Command, ConfigAction, ParsedArgs } from "./types.js";
import { ALL_COMMANDS } from "./types.js";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

function buildParseArgsOptions(argv: string[]) {
  return {
    args: argv,
    strict: false,
    allowPositionals: true,
    options: {
      path: { type: "string" as const, short: "C" },
      // Command shorts (-L → deleteCommand so --delete can mean finish delete-branch)
      init: { type: "boolean" as const, short: "I" },
      start: { type: "boolean" as const, short: "S" },
      finish: { type: "boolean" as const, short: "F" },
      switch: { type: "boolean" as const, short: "W" },
      deleteCommand: { type: "boolean" as const, short: "L" },
      list: { type: "boolean" as const, short: "l" },
      status: { type: "boolean" as const, short: "t" },
      bumpCommand: { type: "boolean" as const, short: "U" },
      help: { type: "boolean" as const, short: "h" },
      version: { type: "boolean" as const, short: "V" },
      feature: { type: "boolean" as const, short: "f" },
      bugfix: { type: "boolean" as const, short: "b" },
      chore: { type: "boolean" as const, short: "c" },
      release: { type: "boolean" as const, short: "r" },
      hotfix: { type: "boolean" as const, short: "x" },
      spike: { type: "boolean" as const, short: "e" },
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
      "dry-run": { type: "boolean" as const },
      verbose: { type: "boolean" as const, short: "v" },
      quiet: { type: "boolean" as const, short: "q" },
      force: { type: "boolean" as const },
      noFf: { type: "boolean" as const },
      "no-ff": { type: "boolean" as const },
      deleteBranch: { type: "boolean" as const, short: "D" },
      delete: { type: "boolean" as const },
      noDelete: { type: "boolean" as const, short: "N" },
      "no-delete": { type: "boolean" as const },
      sign: { type: "boolean" as const, short: "s" },
      noTag: { type: "boolean" as const, short: "T" },
      "no-tag": { type: "boolean" as const },
      tagMessage: { type: "string" as const, short: "M" },
      "tag-message": { type: "string" as const },
      message: { type: "string" as const, short: "m" },
      includeRemote: { type: "boolean" as const },
      "include-remote": { type: "boolean" as const },
      restore: { type: "boolean" as const },
      clean: { type: "boolean" as const },
      cancel: { type: "boolean" as const },
      move: { type: "boolean" as const },
      destroy: { type: "boolean" as const },
      squash: { type: "boolean" as const },
      preview: { type: "boolean" as const },
      bump: { type: "boolean" as const },
      json: { type: "boolean" as const },
      rebase: { type: "boolean" as const },
      "script-alias": { type: "string" as const },
      scriptAlias: { type: "string" as const },
      "no-script-alias": { type: "boolean" as const },
      noScriptAlias: { type: "boolean" as const },
    },
  };
}

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
  if (!stat?.isDirectory()) {
    console.error(`gflows: path is not a directory: ${absolute}`);
    process.exit(EXIT_USER);
  }
  return absolute;
}

function closestCommand(input: string): Command | undefined {
  if (!input || input.length < 2) return undefined;
  const target = input.toLowerCase();
  let best: Command | undefined;
  let bestDistance = 3;
  for (const cmd of ALL_COMMANDS) {
    const d = editDistance(target, cmd);
    if (d < bestDistance) {
      bestDistance = d;
      best = cmd;
    }
  }
  return best;
}

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

function flagTrue(
  v: Record<string, string | boolean | undefined>,
  camel: string,
  kebab?: string,
): boolean {
  if (v[camel] === true) return true;
  if (kebab && v[kebab] === true) return true;
  return false;
}

function flagString(
  v: Record<string, string | boolean | undefined>,
  camel: string,
  kebab?: string,
): string | undefined {
  const a = v[camel];
  if (typeof a === "string" && a.trim() !== "") return a.trim();
  if (kebab) {
    const b = v[kebab];
    if (typeof b === "string" && b.trim() !== "") return b.trim();
  }
  return undefined;
}

function resolveCommandFromFlags(
  v: Record<string, string | boolean | undefined>,
  positionals: string[],
): Command | undefined {
  if (v.init === true) return "init";
  if (v.start === true) return "start";
  if (v.finish === true) return "finish";
  if (v.switch === true) return "switch";
  if (v.deleteCommand === true) return "delete";
  if (v.list === true) return "list";
  if (v.status === true) return "status";
  if (v.bumpCommand === true) return "bump";
  if (v.help === true) return "help";
  if (v.version === true) return "version";
  const first = positionals[0];
  if (first && ALL_COMMANDS.includes(first as Command)) {
    return first as Command;
  }
  return undefined;
}

function resolveType(
  command: Command,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): BranchType | undefined {
  if (command !== "start" && command !== "finish" && command !== "list") {
    return undefined;
  }
  if (command === "list") {
    if (values.feature === true) return "feature";
    if (values.bugfix === true) return "bugfix";
    if (values.chore === true) return "chore";
    if (values.hotfix === true) return "hotfix";
    if (values.spike === true) return "spike";
  } else {
    if (values.release === true) return "release";
    if (values.feature === true) return "feature";
    if (values.bugfix === true) return "bugfix";
    if (values.chore === true) return "chore";
    if (values.hotfix === true) return "hotfix";
    if (values.spike === true) return "spike";
  }
  const idx = positionals[0] && ALL_COMMANDS.includes(positionals[0] as Command) ? 1 : 0;
  const pos = positionals[idx];
  if (pos && BRANCH_TYPES.includes(pos as BranchType)) {
    return pos as BranchType;
  }
  return undefined;
}

function resolveName(
  command: Command,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): string | undefined {
  const branch = values.branch;
  if (typeof branch === "string" && branch.trim() !== "") {
    return branch.trim();
  }
  const skip = positionals[0] && ALL_COMMANDS.includes(positionals[0] as Command) ? 1 : 0;
  if (command === "start") {
    const typeFromPos = positionals[skip] && BRANCH_TYPES.includes(positionals[skip] as BranchType);
    if (typeFromPos) return positionals[skip + 1];
    return positionals[skip];
  }
  if (command === "completion") {
    const shell = positionals[skip];
    if (shell === "bash" || shell === "zsh" || shell === "fish") return shell;
    return undefined;
  }
  if (command === "bump" || command === "release") {
    const dir = positionals[skip];
    if (dir === "up" || dir === "down" || (command === "release" && dir === "current")) {
      return dir;
    }
    return undefined;
  }
  if (command === "switch" || command === "pr" || command === "sync") {
    return positionals[skip];
  }
  return undefined;
}

function resolveBump(positionals: string[]): {
  direction?: "up" | "down";
  type?: "patch" | "minor" | "major";
  keepCurrent?: boolean;
} {
  // Skip leading command when present; with -U, positionals start at up/down
  const skip = positionals[0] === "bump" || positionals[0] === "release" ? 1 : 0;
  const a = positionals[skip];
  const b = positionals[skip + 1];
  if (positionals[0] === "release" && a === "current") {
    return { keepCurrent: true };
  }
  const direction = a === "up" || a === "down" ? a : undefined;
  const type = b === "patch" || b === "minor" || b === "major" ? b : undefined;
  return { direction, type };
}

function resolveConfigArgs(positionals: string[]): {
  action?: ConfigAction;
  key?: string;
  value?: string;
} {
  const skip = positionals[0] === "config" ? 1 : 0;
  const action = positionals[skip];
  if (action !== "get" && action !== "set") return {};
  return { action, key: positionals[skip + 1], value: positionals[skip + 2] };
}

function emptyArgs(cwd: string, pathStr: string | undefined): ParsedArgs {
  return {
    command: "help",
    cwd,
    push: false,
    noPush: false,
    main: undefined,
    dev: undefined,
    remote: undefined,
    branch: undefined,
    yes: false,
    dryRun: false,
    verbose: false,
    quiet: false,
    force: false,
    path: pathStr,
    from: undefined,
    fromMain: false,
    noFf: false,
    deleteAfterFinish: false,
    noDeleteAfterFinish: false,
    signTag: false,
    noTag: false,
    tagMessage: undefined,
    message: undefined,
    squash: false,
    preview: false,
    bumpOnFinish: false,
    keepCurrent: false,
    includeRemote: false,
    json: false,
    rebase: false,
    scriptAlias: undefined,
    noScriptAlias: false,
  };
}

/**
 * Parse raw argv into ParsedArgs.
 * @param options.allowMissingCommand - When true, missing command returns help stub instead of exiting.
 */
export function parse(
  argv: string[] = Bun.argv.slice(2),
  options?: { allowMissingCommand?: boolean },
): ParsedArgs {
  const { values, positionals } = parseArgs(buildParseArgsOptions(argv));
  const v = values as Record<string, string | boolean | undefined>;

  const pathStr = typeof v.path === "string" ? v.path : undefined;
  const cwd = resolveCwd(pathStr);

  const command = resolveCommandFromFlags(v, positionals);
  if (!command) {
    if (options?.allowMissingCommand) {
      return emptyArgs(cwd, pathStr);
    }
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
  const bumpResolved =
    command === "bump" || command === "release"
      ? resolveBump(positionals)
      : { direction: undefined, type: undefined, keepCurrent: undefined };
  const bumpDirection = bumpResolved.direction;
  const bumpType = bumpResolved.type;
  const keepCurrent = bumpResolved.keepCurrent === true;
  const configArgs = command === "config" ? resolveConfigArgs(positionals) : {};

  const branchNames =
    command === "delete"
      ? positionals[0] === "delete"
        ? positionals.slice(1)
        : v.deleteCommand === true
          ? positionals
          : positionals[0] && ALL_COMMANDS.includes(positionals[0] as Command)
            ? positionals.slice(1)
            : positionals
      : undefined;

  const includeRemote =
    command === "list"
      ? flagTrue(v, "includeRemote", "include-remote") || v.release === true
      : false;

  let completionShell: "bash" | "zsh" | "fish" | undefined;
  if (command === "completion" && name === "bash") completionShell = "bash";
  else if (command === "completion" && name === "zsh") completionShell = "zsh";
  else if (command === "completion" && name === "fish") completionShell = "fish";

  let switchMode: "restore" | "clean" | "cancel" | "move" | "destroy" | undefined;
  if (command === "switch") {
    const modes = [
      v.restore === true && ("restore" as const),
      v.clean === true && ("clean" as const),
      v.cancel === true && ("cancel" as const),
      v.move === true && ("move" as const),
      v.destroy === true && ("destroy" as const),
    ].filter(Boolean) as Array<"restore" | "clean" | "cancel" | "move" | "destroy">;
    if (modes.length > 1) {
      console.error(
        "gflows switch: only one of --restore, --clean, --cancel, --move, or --destroy may be used at a time.",
      );
      process.exit(EXIT_USER);
    }
    switchMode = modes[0];
  }

  const fromRaw = typeof v.from === "string" && v.from.trim() !== "" ? v.from.trim() : undefined;
  const mainOverride =
    typeof v.main === "string" && v.main.trim() !== "" ? v.main.trim() : undefined;
  const fromMain = fromRaw === "main" || (!!mainOverride && fromRaw === mainOverride);

  return {
    command,
    cwd,
    type,
    name,
    completionShell,
    branchNames,
    bumpDirection,
    bumpType,
    keepCurrent,
    configAction: configArgs.action,
    configKey: configArgs.key,
    configValue: configArgs.value,
    push: v.push === true,
    noPush: flagTrue(v, "noPush", "no-push"),
    main: mainOverride,
    dev: typeof v.dev === "string" && v.dev.trim() !== "" ? v.dev.trim() : undefined,
    remote: typeof v.remote === "string" ? v.remote : undefined,
    branch: typeof v.branch === "string" ? v.branch : undefined,
    yes: v.yes === true,
    dryRun: flagTrue(v, "dryRun", "dry-run"),
    verbose: v.verbose === true,
    quiet: v.quiet === true,
    force: v.force === true,
    path: pathStr,
    from: fromRaw,
    fromMain,
    noFf: flagTrue(v, "noFf", "no-ff"),
    deleteAfterFinish: flagTrue(v, "deleteBranch") || flagTrue(v, "delete"),
    noDeleteAfterFinish: flagTrue(v, "noDelete", "no-delete"),
    signTag: v.sign === true,
    noTag: flagTrue(v, "noTag", "no-tag"),
    tagMessage: flagString(v, "tagMessage", "tag-message"),
    message: typeof v.message === "string" ? v.message : undefined,
    squash: v.squash === true,
    preview: v.preview === true,
    bumpOnFinish: v.bump === true,
    includeRemote,
    json: v.json === true,
    rebase: v.rebase === true,
    switchMode,
    scriptAlias: flagString(v, "scriptAlias", "script-alias"),
    noScriptAlias: flagTrue(v, "noScriptAlias", "no-script-alias"),
  };
}
