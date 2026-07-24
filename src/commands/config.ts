/**
 * Config get/set for .gflows.json.
 * @module commands/config
 */

import { readConfigFile, resolveConfig, writeConfigFile } from "../config.js";
import { EXIT_USER } from "../constants.js";
import { resolveRepoRoot } from "../git.js";
import { hint, success } from "../out.js";
import type { BranchType, GflowsConfigFile, ParsedArgs } from "../types.js";

const PREFIX_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/**
 * get/set gflows configuration.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const isTTY = Boolean(process.stdin.isTTY);

  let action = args.configAction;
  let key = args.configKey;
  let value = args.configValue;

  if (!action && isTTY) {
    const { inputPrompt, selectPrompt } = await import("../prompts.js");
    action = await selectPrompt<"get" | "set">({
      message: "Config action",
      options: [
        { label: "get", value: "get" },
        { label: "set", value: "set" },
      ],
    });
    key = await inputPrompt({ message: "Key (main|dev|remote|prefixes.<type>)" });
    if (action === "set") {
      value = await inputPrompt({ message: "Value" });
    }
  }

  if (!action || (action !== "get" && action !== "set")) {
    console.error(
      "gflows config: use `gflows config get <key>` or `gflows config set <key> <value>`.",
    );
    process.exit(EXIT_USER);
  }
  if (!key) {
    console.error("gflows config: missing key.");
    process.exit(EXIT_USER);
  }

  const resolved = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );

  if (action === "get") {
    const out = getValue(resolved, key);
    if (out === undefined) {
      console.error(`gflows config: unknown key '${key}'.`);
      process.exit(EXIT_USER);
    }
    if (args.json) {
      console.log(JSON.stringify({ [key]: out }, null, 2));
    } else {
      console.log(String(out));
    }
    return;
  }

  if (value === undefined || value === "") {
    console.error("gflows config set: missing value.");
    process.exit(EXIT_USER);
  }

  const current = readConfigFile(repoRoot).config ?? {};
  const next = setValue(current, key, value);
  if (!args.dryRun) {
    writeConfigFile(repoRoot, next);
  }
  if (!args.quiet) {
    success(`gflows: set ${key} = ${value}`);
  }
  hint("Stored in .gflows.json");
}

function getValue(resolved: ReturnType<typeof resolveConfig>, key: string): string | undefined {
  if (key === "main") return resolved.main;
  if (key === "dev") return resolved.dev;
  if (key === "remote") return resolved.remote;
  if (key.startsWith("prefixes.")) {
    const t = key.slice("prefixes.".length) as BranchType;
    if (PREFIX_TYPES.includes(t)) return resolved.prefixes[t];
  }
  return undefined;
}

function setValue(current: GflowsConfigFile, key: string, value: string): GflowsConfigFile {
  const next: GflowsConfigFile = { ...current, prefixes: { ...current.prefixes } };
  if (key === "main") {
    next.main = value;
    return next;
  }
  if (key === "dev") {
    next.dev = value;
    return next;
  }
  if (key === "remote") {
    next.remote = value;
    return next;
  }
  if (key.startsWith("prefixes.")) {
    const t = key.slice("prefixes.".length) as BranchType;
    if (!PREFIX_TYPES.includes(t)) {
      console.error(`gflows config: unknown prefix type '${t}'.`);
      process.exit(EXIT_USER);
    }
    next.prefixes = { ...next.prefixes, [t]: value };
    return next;
  }
  console.error(`gflows config: unknown key '${key}'.`);
  process.exit(EXIT_USER);
}
