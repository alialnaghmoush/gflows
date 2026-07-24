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
    );
    void instance.waitUntilExit().then(() => {
      done({ kind: "quit" });
    });
  });
}

/**
 * Raw stdin “press enter” (no Clack / no Ink).
 */
function waitEnterRaw(label: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`${label}\n`);
    if (typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const onData = (chunk: string | Buffer) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (s === "\r" || s === "\n" || s === "\x03") {
        process.stdin.off("data", onData);
        if (typeof process.stdin.setRawMode === "function") {
          process.stdin.setRawMode(false);
        }
        resolve();
      }
    };
    process.stdin.on("data", onData);
  });
}
