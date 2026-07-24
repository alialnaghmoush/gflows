/**
 * Stdin helpers for surviving Ink teardown before Clack / dispatch.
 * @module tui/stdin
 */

/**
 * Re-arm process.stdin after Ink unmounts (Ink calls `stdin.unref()`).
 * Without this, interactive Clack prompts paint once then the process exits.
 */
export function prepareStdinAfterInk(): void {
  const stdin = process.stdin;
  if (typeof stdin.setRawMode === "function") {
    try {
      stdin.setRawMode(false);
    } catch {
      // ignore — may already be non-raw / closed
    }
  }
  stdin.resume();
  stdin.ref();

  if (typeof stdin.read === "function") {
    for (;;) {
      const pending = stdin.read();
      if (pending === null) break;
    }
  }
}
