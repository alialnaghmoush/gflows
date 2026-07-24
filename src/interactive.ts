/**
 * Interactive hub entry — prefers Ink TUI, falls back to Clack menu.
 * @module interactive
 */

import { resolveConfig } from "./config.js";
import { dispatch } from "./dispatch.js";
import { classifyBranch, formatMergeTarget, getBaseBranchName } from "./flow.js";
import { getAheadBehind, getCurrentBranch, resolveRepoRoot } from "./git.js";
import { hint } from "./out.js";
import { confirmPrompt, inputPrompt, selectPrompt } from "./prompts.js";
import { type RecommendAction, recommend } from "./recommend.js";
import { readActiveRun } from "./run-state.js";
import type { BranchType } from "./types.js";
import { ansi, paint, rule } from "./ui.js";
import { printViz, type VizSnapshot } from "./viz.js";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

export { dispatch } from "./dispatch.js";

/**
 * Runs the interactive hub until the user quits.
 * Uses the Ink fullscreen TUI when stdin/stdout are TTYs; otherwise Clack menu.
 */
export async function runHub(cwd: string): Promise<void> {
  const { runTuiHub } = await import("./tui/hub.js");
  const usedTui = await runTuiHub(cwd);
  if (!usedTui) {
    await runLegacyHub(cwd);
  }
}

/**
 * Legacy Clack select hub (when Ink/TUI cannot run).
 */
async function runLegacyHub(cwd: string): Promise<void> {
  for (;;) {
    let snap: VizSnapshot | null = null;
    try {
      snap = await printViz(cwd);
    } catch {
      await printContextFallback(cwd);
    }

    const rec = snap ? recommend(snap) : null;
    const options = buildLegacyOptions(rec?.action ?? null, snap);
    const action = await selectPrompt({
      message: rec ? `Recommended · ${rec.label}` : "What do you want to do?",
      options,
      initialValue: options[0]?.value,
    });

    if (action === "quit") {
      console.log(paint(ansi.dim, "Bye."));
      break;
    }

    try {
      await runHubAction(cwd, action);
    } catch (err) {
      console.error("gflows:", err instanceof Error ? err.message : String(err));
    }

    console.log("");
    console.log(rule(56));
    const again = await confirmPrompt({ message: "Back to menu?", initialValue: true });
    if (!again) break;
  }
}

function buildLegacyOptions(
  recommended: RecommendAction | null,
  snap: VizSnapshot | null,
): Array<{ value: string; label: string; hint?: string }> {
  const items: Array<{ value: string; label: string; hint?: string }> = [];
  if (snap?.needsInit) {
    items.push({ value: "init", label: "Initialize repo", hint: "gflows init" });
  }
  items.push(
    { value: "start", label: "Start new work" },
    { value: "sync", label: "Sync this branch with base" },
    { value: "pr", label: "Open a pull request" },
    { value: "finish", label: "Finish / merge this branch" },
    { value: "switch", label: "Switch branch" },
    { value: "list", label: "List branches" },
    { value: "viz", label: "Refresh map" },
    { value: "doctor", label: "Doctor (check setup)" },
    { value: "config", label: "Config" },
    { value: "bump", label: "Bump version" },
    { value: "continue", label: "Continue suspended operation" },
    { value: "help", label: "Help" },
    { value: "quit", label: "Quit" },
  );

  const prefer = recommended && recommended !== "commit" ? recommended : null;
  if (prefer) {
    const idx = items.findIndex((a) => a.value === prefer);
    if (idx >= 0) {
      const [item] = items.splice(idx, 1);
      if (item) {
        items.unshift({ ...item, label: `★ ${item.label}` });
      }
    }
  }
  return items;
}

async function runHubAction(cwd: string, action: string): Promise<void> {
  if (action === "viz") {
    await printViz(cwd);
    return;
  }
  if (action === "start") {
    await promptStart(cwd);
    return;
  }
  if (action === "finish") {
    const push = await confirmPrompt({ message: "Push after finish?", initialValue: false });
    await dispatch(cwd, ["finish", "-y", push ? "-p" : "-P"]);
    return;
  }
  if (action === "sync") {
    const rebase = await confirmPrompt({
      message: "Rebase onto base (instead of merge)?",
      initialValue: false,
    });
    await dispatch(cwd, ["sync", ...(rebase ? ["--rebase"] : []), "--force"]);
    return;
  }
  await dispatch(cwd, [action]);
}

/** Fallback text context when viz cannot run (e.g. not a repo). */
async function printContextFallback(cwd: string): Promise<void> {
  try {
    const root = await resolveRepoRoot(cwd);
    const config = resolveConfig(root, {}, {});
    const current = await getCurrentBranch(root, {});
    const active = readActiveRun(root);
    console.log("");
    console.log(paint(ansi.cyan + ansi.bold, "╭─ gflows ──────────────────────────────╮"));
    if (active) {
      console.log(`│ Suspended: ${active.command} — use Continue, or gflows abort`);
    }
    if (!current) {
      console.log("│ HEAD: detached");
      console.log(paint(ansi.dim, "╰────────────────────────────────────────╯"));
      return;
    }
    const kind = classifyBranch(current, config);
    console.log(`│ Branch: ${current}`);
    if (kind === "main" || kind === "dev") {
      console.log(`│ Type: long-lived (${kind})`);
      console.log(paint(ansi.dim, "╰────────────────────────────────────────╯"));
      hint("Start new work from the menu, or switch to a workflow branch.");
      return;
    }
    if (kind === null) {
      console.log("│ Type: unknown");
      console.log(paint(ansi.dim, "╰────────────────────────────────────────╯"));
      return;
    }
    const base = getBaseBranchName(kind, false, config);
    const { ahead, behind } = await getAheadBehind(root, base, current, {});
    const meta = formatMergeTarget(
      kind === "release" || kind === "hotfix" ? "main-then-dev" : "dev",
      config,
    );
    console.log(`│ Type: ${kind}  ·  base: ${base}  ·  +${ahead}/-${behind}`);
    console.log(`│ Merge: ${meta}`);
    console.log(paint(ansi.dim, "╰────────────────────────────────────────╯"));
  } catch {
    console.log("");
    console.log(paint(ansi.yellow, "╭─ gflows ──────────────────────────────╮"));
    console.log("│ Not a git repo here");
    console.log(paint(ansi.dim, "│ → cd into a repo, or git init + gflows init"));
    console.log(paint(ansi.dim, "╰────────────────────────────────────────╯"));
    console.log("");
  }
}

async function promptStart(cwd: string): Promise<void> {
  const { type, name } = await promptStartArgs();
  const push = await confirmPrompt({ message: "Push after create?", initialValue: false });
  const argv = ["start", type, name, push ? "-p" : "-P"];
  if (type === "bugfix") {
    const fromMain = await confirmPrompt({
      message: "Base from main (production fix)?",
      initialValue: false,
    });
    if (fromMain) argv.push("-o", "main");
  }
  await dispatch(cwd, argv);
}

/**
 * Prompts for start type/name when missing (TTY).
 */
export async function promptStartArgs(): Promise<{ type: BranchType; name: string }> {
  const type = await selectPrompt({
    message: "Branch type",
    options: BRANCH_TYPES.map((t) => ({ value: t, label: t })),
  });
  const name = await inputPrompt({
    message: type === "release" || type === "hotfix" ? "Version (vX.Y.Z)" : "Branch name",
  });
  return { type, name };
}
