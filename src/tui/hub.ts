/**
 * Ink hub runner — wizards stay in Ink; only git dispatch drops to the main screen.
 * @module tui/hub
 */

import { render } from "ink";
import React from "react";
import { dispatch } from "../dispatch.js";
import { PromptCancelledError } from "../prompts.js";
import { runWithSoftExit, SoftExitError } from "../soft-exit.js";
import { type HubSessionResult, HubShell } from "./HubShell.js";
import { prepareStdinAfterInk } from "./stdin.js";

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
    // Ink needs a live, referenced stdin after waitEnter / Clack / prior unmount.
    prepareStdinAfterInk();
    const result = await runHubSession(cwd);
    if (result.kind === "quit") break;

    if (result.kind === "run") {
      prepareStdinAfterInk();
      console.log("");
      try {
        // Many commands call process.exit on validation/success paths — trap them
        // so the hub can show “press enter” and remount instead of dying.
        await runWithSoftExit(() => dispatch(cwd, result.argv));
      } catch (err) {
        if (err instanceof SoftExitError) {
          // Command already printed its output / error; continue to waitEnter.
        } else if (!(err instanceof PromptCancelledError)) {
          console.error("gflows:", err instanceof Error ? err.message : String(err));
        }
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
 * Leaves stdin armed for the next Ink remount (does not pause/unref).
 */
function waitEnterRaw(label: string): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(`${label}\n`);
    if (typeof stdin.setRawMode === "function") {
      try {
        stdin.setRawMode(true);
      } catch {
        // ignore
      }
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

    const finish = () => {
      stdin.off("data", onData);
      // Critical: leave stdin ready for Ink remount (old code paused+unref'd → hub died).
      prepareStdinAfterInk();
      resolve();
    };

    const onData = (chunk: string | Buffer) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (s.includes("\r") || s.includes("\n") || s.includes("\x03")) {
        finish();
      }
    };
    stdin.on("data", onData);
  });
}
