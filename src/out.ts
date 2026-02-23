/**
 * Stdout helpers for success/info messages so they are not sent to stderr (which many terminals show in red).
 * @module out
 */

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const SUCCESS_ICON = "✓";

/**
 * Whether stdout is a TTY and can safely use ANSI color codes.
 */
function isColorCapable(): boolean {
  return typeof process.stdout.isTTY === "boolean" && process.stdout.isTTY;
}

/**
 * Prints a success message to stdout with a green checkmark icon.
 * Uses stdout so terminals do not render it as error (red). Disables color when not a TTY (e.g. CI).
 *
 * @param message - One-line success message to print (no trailing newline added).
 */
export function success(message: string): void {
  const icon = SUCCESS_ICON;
  const line = isColorCapable() ? `${GREEN}${icon}${RESET} ${message}` : `${icon} ${message}`;
  console.log(line);
}

/**
 * Prints a hint line to stdout (dim when TTY). Use after success messages to suggest next steps.
 * Skips color when not a TTY (e.g. CI). Omit when --quiet to keep output minimal.
 *
 * @param message - One-line hint (e.g. "Run gflows start feature <name> to create a branch").
 */
export function hint(message: string): void {
  const line = isColorCapable() ? `${DIM}Hint: ${message}${RESET}` : `Hint: ${message}`;
  console.log(line);
}

const BANNER_INNER_WIDTH = 42;

/** Box-drawing characters for table-style banner. */
const BOX = {
  TL: "╔",
  TR: "╗",
  BL: "╚",
  BR: "╝",
  H: "═",
  V: "║",
} as const;

/**
 * Prints a table-style banner to stdout (e.g. for init). Uses cyan/bold when TTY.
 * Skips color when not a TTY (e.g. CI). Supports multiple detail lines.
 *
 * @param title - Main banner line (e.g. "gflows init").
 * @param lines - Optional lines below the title (subtitle, key-value rows, blank "" for spacing).
 */
export function banner(title: string, lines?: string[]): void {
  const color = isColorCapable();
  const c = (s: string) => (color ? `${CYAN}${s}${RESET}` : s);
  const inner = BANNER_INNER_WIDTH - 4;
  const top = `  ${c(BOX.TL)}${c(BOX.H.repeat(BANNER_INNER_WIDTH))}${c(BOX.TR)}`;
  const bottom = `  ${c(BOX.BL)}${c(BOX.H.repeat(BANNER_INNER_WIDTH))}${c(BOX.BR)}`;
  const row = (text: string) =>
    `  ${c(BOX.V)}  ${text}${" ".repeat(Math.max(0, inner - text.length))}  ${c(BOX.V)}`;
  const titleDisplay = color ? `${CYAN}${BOLD}${title}${RESET}` : title;
  console.log("");
  console.log(top);
  console.log(
    "  " +
      c(BOX.V) +
      "  " +
      titleDisplay +
      " ".repeat(Math.max(0, inner - title.length)) +
      "  " +
      c(BOX.V),
  );
  if (lines?.length) {
    for (const line of lines) {
      console.log(line === "" ? row("") : row(line));
    }
  }
  console.log(bottom);
  console.log("");
}
