/**
 * Print a machine-readable catalog of gflows commands, flags, types, and exit codes.
 * @module commands/schema
 */

import type { ParsedArgs } from "../types.js";
import { ALL_COMMANDS, BRANCH_TYPE_SHORTS } from "../types.js";
import { getVersion } from "../version.js";

/**
 * Emits JSON schema for agents and tooling.
 */
export async function run(_args: ParsedArgs): Promise<void> {
  const schema = {
    name: "gflows",
    version: getVersion(),
    description: "Git branching workflow CLI (main + dev + typed short-lived branches)",
    exitCodes: {
      "0": "success",
      "1": "usage/validation",
      "2": "git/system",
    },
    branchTypes: Object.entries(BRANCH_TYPE_SHORTS).map(([type, short]) => ({
      type,
      short,
    })),
    commands: ALL_COMMANDS.map((command) => ({
      command,
      ...commandMeta(command),
    })),
    flags: {
      common: [
        "-C/--path",
        "-p/--push",
        "-P/--no-push",
        "-y/--yes",
        "-d/--dry-run",
        "-v/--verbose",
        "-q/--quiet",
        "--force",
        "--json",
        "--main",
        "--dev",
        "-R/--remote",
      ],
      finish: [
        "-B/--branch",
        "-D/--delete",
        "-N/--no-delete",
        "--no-ff",
        "--squash",
        "--preview",
        "--bump",
        "-s/--sign",
        "-T/--no-tag",
        "-M/--tag-message",
        "-m/--message",
      ],
      start: ["-o/--from", "--force", "-p/--push"],
      sync: ["--rebase", "--force"],
      list: ["-r/--include-remote", "--json"],
      status: ["--json"],
    },
    agentNotes: [
      "Always pass explicit flags in non-TTY (never assume interactive hub).",
      "Prefer -y to accept finish plan (delete defaults on); pass -P or -p for push.",
      "On conflict: gflows continue | gflows abort | gflows undo.",
      "Use gflows schema and AGENTS.md as source of truth.",
    ],
  };
  console.log(JSON.stringify(schema, null, 2));
}

function commandMeta(command: string): { summary: string; interactiveOk: boolean } {
  const map: Record<string, { summary: string; interactiveOk: boolean }> = {
    init: { summary: "Ensure main; create dev", interactiveOk: true },
    start: { summary: "Create workflow branch", interactiveOk: true },
    finish: { summary: "Merge and close workflow branch", interactiveOk: true },
    switch: { summary: "Switch workflow branch", interactiveOk: true },
    delete: { summary: "Delete local workflow branches", interactiveOk: true },
    list: { summary: "List workflow branches", interactiveOk: false },
    bump: { summary: "Bump package version", interactiveOk: true },
    sync: { summary: "Update branch from base", interactiveOk: true },
    pr: { summary: "Open PR/MR via gh/glab", interactiveOk: true },
    viz: { summary: "Visual branch map and flow diagram", interactiveOk: true },
    doctor: { summary: "Repo health checks", interactiveOk: false },
    config: { summary: "Get/set .gflows.json", interactiveOk: true },
    schema: { summary: "Machine-readable command catalog", interactiveOk: false },
    continue: { summary: "Resume suspended operation", interactiveOk: false },
    undo: { summary: "Undo last completed operation", interactiveOk: false },
    abort: { summary: "Abort suspended operation", interactiveOk: false },
    completion: { summary: "Shell completion script", interactiveOk: false },
    status: { summary: "Current branch flow info", interactiveOk: false },
    help: { summary: "Usage", interactiveOk: false },
    version: { summary: "CLI version", interactiveOk: false },
    mcp: { summary: "Start MCP server for agents", interactiveOk: false },
  };
  return map[command] ?? { summary: command, interactiveOk: false };
}
