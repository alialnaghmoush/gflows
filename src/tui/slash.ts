/**
 * Slash-command catalog for the Ink hub prompt.
 * @module tui/slash
 */

/** One slash command shown in hub autocomplete. */
export interface SlashCommand {
  /** Command name without leading `/`. */
  name: string;
  /** Short description for the suggestion list. */
  hint: string;
}

/**
 * Hub slash commands (order = suggestion priority).
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "init", hint: "Initialize repo" },
  { name: "start", hint: "Start new work (wizard)" },
  { name: "sync", hint: "Sync with base (wizard)" },
  { name: "pr", hint: "Open pull request" },
  { name: "finish", hint: "Finish / merge (wizard)" },
  { name: "continue", hint: "Continue suspended run" },
  { name: "switch", hint: "Switch branch" },
  { name: "list", hint: "List branches" },
  { name: "doctor", hint: "Doctor checks" },
  { name: "help", hint: "Show help" },
  { name: "status", hint: "Repo status" },
  { name: "config", hint: "Show config" },
  { name: "version", hint: "Show version" },
  { name: "bump", hint: "Bump version" },
  { name: "viz", hint: "Branch map (on home)" },
  { name: "quit", hint: "Leave hub" },
] as const;

/**
 * Filters slash commands by the typed buffer (e.g. `/st` → start, status, switch).
 */
export function filterSlashCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const body = input.slice(1);
  const token = (body.split(/\s+/)[0] ?? "").toLowerCase();
  // After a completed command + space, stop suggesting names
  if (body.includes(" ") && token.length > 0) {
    const exact = SLASH_COMMANDS.some((c) => c.name === token);
    if (exact) return [];
  }
  if (token.length === 0) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(token));
}

/**
 * Completes the command portion of a slash buffer (Tab).
 * @returns updated input, or null if nothing to complete.
 */
export function completeSlashInput(input: string, selectedIndex = 0): string | null {
  const matches = filterSlashCommands(input);
  if (matches.length === 0) return null;
  const pick = matches[Math.min(selectedIndex, matches.length - 1)];
  if (!pick) return null;
  const rest = input.includes(" ") ? input.slice(input.indexOf(" ")) : "";
  if (rest.trim().length > 0) return null;
  return `/${pick.name}${matches.length === 1 ? " " : ""}`;
}
