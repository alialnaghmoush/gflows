/**
 * Modern terminal chrome shared by viz and the interactive hub.
 * Lightweight ANSI panels (Claude Code / Codex–style), no TUI framework.
 * @module ui
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

/**
 * Whether stdout can use ANSI color.
 */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  return typeof process.stdout.isTTY === "boolean" && process.stdout.isTTY;
}

/**
 * Wraps text in an ANSI code when color is enabled.
 */
export function paint(code: string, text: string): string {
  return colorEnabled() ? `${code}${text}${RESET}` : text;
}

/** Shared ANSI codes for callers that compose styles. */
export const ansi = {
  reset: RESET,
  bold: BOLD,
  dim: DIM,
  cyan: CYAN,
  green: GREEN,
  yellow: YELLOW,
  magenta: MAGENTA,
  blue: BLUE,
} as const;

const ESC = "\u001b";
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const ANSI_PREFIX_RE = new RegExp(`^${ESC}\\[[0-9;]*m`);

/**
 * Visible length of a string ignoring ANSI escape sequences.
 */
export function visibleLength(text: string): number {
  return text.replace(ANSI_RE, "").length;
}

/**
 * Pads or soft-truncates a line to a target visible width.
 */
export function padVisible(text: string, width: number): string {
  const len = visibleLength(text);
  if (len === width) return text;
  if (len < width) return text + " ".repeat(width - len);
  let out = "";
  let vis = 0;
  let i = 0;
  while (i < text.length && vis < width - 1) {
    if (text[i] === ESC) {
      const m = text.slice(i).match(ANSI_PREFIX_RE);
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    out += text[i];
    vis++;
    i++;
  }
  return `${out}…`;
}

/**
 * Renders a rounded status panel (title bar + body rows).
 */
export function renderPanel(title: string, body: string[], width = 56): string[] {
  const inner = Math.max(24, width - 2);
  const labeled = `─ ${title} `;
  const fill = Math.max(0, inner - visibleLength(labeled));
  const top = paint(CYAN + BOLD, `╭${labeled}${"─".repeat(fill)}╮`);
  const bottom = paint(DIM, `╰${"─".repeat(inner)}╯`);
  const rows = body.map((line) => {
    const content = padVisible(` ${line}`, inner);
    return `${paint(DIM, "│")}${content}${paint(DIM, "│")}`;
  });
  return [top, ...rows, bottom];
}

/**
 * Section header.
 */
export function section(title: string): string {
  return paint(BOLD, title);
}

/**
 * Dim horizontal rule.
 */
export function rule(width = 56): string {
  return paint(DIM, "─".repeat(width));
}

/**
 * Accent arrow for recommended next step.
 */
export function recommendLine(label: string): string {
  return `${paint(GREEN + BOLD, "→")} ${paint(BOLD, label)}`;
}

/**
 * Chip / badge text.
 */
export function chip(text: string, tone: "ok" | "warn" | "info" | "muted" = "muted"): string {
  const code = tone === "ok" ? GREEN : tone === "warn" ? YELLOW : tone === "info" ? CYAN : DIM;
  return paint(code, `[${text}]`);
}

/**
 * Keyboard hint footer.
 */
export function keyHints(pairs: Array<[string, string]>): string {
  return pairs
    .map(([key, label]) => `${paint(BOLD, key)} ${paint(DIM, label)}`)
    .join(paint(DIM, "  ·  "));
}
