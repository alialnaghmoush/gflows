/**
 * Persist multi-step gflows operations so continue / undo / abort can recover.
 * State lives under .git/gflows/ (gitignored by nature of .git).
 * @module run-state
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One planned step in a multi-step operation. */
export interface RunStep {
  /** Step id for resume (e.g. merge-main, tag, merge-dev, delete, push). */
  id: string;
  /** Human description. */
  label: string;
  /** Opaque payload for the step executor. */
  data?: Record<string, unknown>;
}

/** Suspended or completed run record. */
export interface GflowsRunState {
  /** Command that created this run (finish, sync, …). */
  command: string;
  /** ISO timestamp when started. */
  startedAt: string;
  /** Status of the run. */
  status: "running" | "suspended" | "completed";
  /** Index of next step to execute. */
  nextStep: number;
  /** Planned steps. */
  steps: RunStep[];
  /** Snapshot for undo (branch tips, tag created, previous HEAD, etc.). */
  undo: Record<string, unknown>;
  /** Extra context (branch, type, config names, flags). */
  context: Record<string, unknown>;
  /** Last error message when suspended. */
  lastError?: string;
}

const STATE_DIR = "gflows";
const ACTIVE_FILE = "run.json";
const LAST_FILE = "last.json";

function gitGflowsDir(repoRoot: string): string {
  return join(repoRoot, ".git", STATE_DIR);
}

function activePath(repoRoot: string): string {
  return join(gitGflowsDir(repoRoot), ACTIVE_FILE);
}

function lastPath(repoRoot: string): string {
  return join(gitGflowsDir(repoRoot), LAST_FILE);
}

function ensureDir(repoRoot: string): void {
  const dir = gitGflowsDir(repoRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Reads the active (suspended/running) run state, or null.
 */
export function readActiveRun(repoRoot: string): GflowsRunState | null {
  const path = activePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as GflowsRunState;
  } catch {
    return null;
  }
}

/**
 * Reads the last completed run (for undo), or null.
 */
export function readLastRun(repoRoot: string): GflowsRunState | null {
  const path = lastPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as GflowsRunState;
  } catch {
    return null;
  }
}

/**
 * Writes active run state.
 */
export function writeActiveRun(repoRoot: string, state: GflowsRunState): void {
  ensureDir(repoRoot);
  writeFileSync(activePath(repoRoot), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

/**
 * Clears active run state (after abort or successful complete move to last).
 */
export function clearActiveRun(repoRoot: string): void {
  const path = activePath(repoRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Marks run completed and moves it to last.json for undo; clears active.
 */
export function completeRun(repoRoot: string, state: GflowsRunState): void {
  ensureDir(repoRoot);
  const done: GflowsRunState = {
    ...state,
    status: "completed",
    nextStep: state.steps.length,
  };
  writeFileSync(lastPath(repoRoot), `${JSON.stringify(done, null, 2)}\n`, "utf-8");
  clearActiveRun(repoRoot);
}

/**
 * Clears last completed run (after undo).
 */
export function clearLastRun(repoRoot: string): void {
  const path = lastPath(repoRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Creates a new running state and persists it.
 */
export function startRun(
  repoRoot: string,
  command: string,
  steps: RunStep[],
  context: Record<string, unknown>,
  undo: Record<string, unknown>,
): GflowsRunState {
  const state: GflowsRunState = {
    command,
    startedAt: new Date().toISOString(),
    status: "running",
    nextStep: 0,
    steps,
    undo,
    context,
  };
  writeActiveRun(repoRoot, state);
  return state;
}

/**
 * Suspends the active run after a failure (e.g. merge conflict).
 */
export function suspendRun(repoRoot: string, state: GflowsRunState, lastError: string): void {
  writeActiveRun(repoRoot, {
    ...state,
    status: "suspended",
    lastError,
  });
}
