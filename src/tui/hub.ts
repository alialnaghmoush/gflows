/**
 * Ink hub runner — wizards stay in Ink; only git dispatch drops to the main screen.
 * @module tui/hub
 */

import { render } from "ink";
import React from "react";
import { dispatch } from "../dispatch.js";
import { type HubSessionResult, HubShell } from "./HubShell.js";

/**
 * Whether stdin/stdout can host the Ink hub.
 */
export function canUseTui(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Runs the Ink fullscreen hub until quit.
 * @returns true if the TUI ran, false if caller should use the legacy menu.
 */
export async function runTuiHub(cwd: string): Promise<boolean> {
  if (!canUseTui()) return false;

  for (;;) {
    const result = await runHubSession(cwd);
    if (result.kind === "quit") break;

    if (result.kind === "run") {
      console.log("");
      try {
        await dispatch(cwd, result.argv);
      } catch (err) {
        console.error("gflows:", err instanceof Error ? err.message : String(err));
      }
      console.log("");
      await waitEnterRaw("Press enter to return to hub…");
    }
  }

  return true;
}

function runHubSession(cwd: string): Promise<HubSessionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: HubSessionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const instance = render(
      React.createElement(HubShell, {
        cwd,
        onDone: (result) => {
          done(result);
          instance.unmount();
        },
      }),
      {
        // Keep hub off the primary scrollback so command output isn't stranded
        // under a full-height cleared frame when we drop out for dispatch.
        alternateScreen: true,
        exitOnCtrlC: false,
      },
    );
    void instance.waitUntilExit().then(() => {
      done({ kind: "quit" });
    });
  });
}

/**
 * Raw stdin “press enter” (no Clack / no Ink).
 * Ink unrefs stdin on unmount — we must ref it again or the process exits
 * before the user can return to the hub.
 */
function waitEnterRaw(label: string): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(`${label}\n`);
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.ref();

    // Drop buffered Enter from the hub key that launched this command.
    if (typeof stdin.read === "function") {
      for (;;) {
        const pending = stdin.read();
        if (pending === null) break;
      }
    }

    const cleanup = () => {
      stdin.off("data", onData);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.unref();
    };

    const onData = (chunk: string | Buffer) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (s.includes("\r") || s.includes("\n") || s.includes("\x03")) {
        cleanup();
        resolve();
      }
    };
    stdin.on("data", onData);
  });
}
