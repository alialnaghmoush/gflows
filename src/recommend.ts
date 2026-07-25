/**
 * Contextual next-step recommendations for the hub and viz panel.
 * @module recommend
 */

import type { VizSnapshot } from "./viz.js";

/** Hub / CLI action ids used for recommendations. */
export type RecommendAction =
  | "init"
  | "continue"
  | "sync"
  | "finish"
  | "release"
  | "pr"
  | "start"
  | "commit"
  | "doctor"
  | "help";

/** A single recommended next step. */
export interface Recommendation {
  action: RecommendAction;
  /** Short label for the status panel. */
  label: string;
  /** One-line explanation. */
  detail: string;
  /** Menu choice label (human). */
  menuLabel: string;
}

/**
 * Picks the best next action from a viz snapshot (Claude/Codex-style “what next”).
 */
export function recommend(snap: VizSnapshot): Recommendation {
  if (snap.needsInit) {
    return {
      action: "init",
      label: "Initialize this repo",
      detail: "Create main + dev and write .gflows.json",
      menuLabel: "Initialize repo (gflows init)",
    };
  }
  if (snap.suspended) {
    return {
      action: "continue",
      label: "Continue suspended operation",
      detail: snap.suspended,
      menuLabel: "Continue suspended operation",
    };
  }
  if (!snap.current) {
    return {
      action: "doctor",
      label: "Check repo health",
      detail: "HEAD is detached",
      menuLabel: "Doctor (check setup)",
    };
  }

  const row = snap.rows.find((r) => r.name === snap.current);
  if (!row) {
    return {
      action: "start",
      label: "Start new work",
      detail: "Current branch is outside gflows prefixes",
      menuLabel: "Start new work",
    };
  }

  if (row.type === "main") {
    return {
      action: "start",
      label: "Start a hotfix (or switch to dev)",
      detail: "Production line — prefer hotfix / release from here",
      menuLabel: "Start new work",
    };
  }
  if (row.type === "dev") {
    return {
      action: "start",
      label: "Start a feature (or chore / bugfix)",
      detail: "Integration line — short-lived branches start here; /release for quick ship to main",
      menuLabel: "Start new work",
    };
  }
  if (row.type === "unknown") {
    return {
      action: "doctor",
      label: "Run doctor",
      detail: "Branch type unknown — check prefixes / config",
      menuLabel: "Doctor (check setup)",
    };
  }

  // Workflow branch
  if (row.behind > 0) {
    return {
      action: "sync",
      label: "Sync with base (base moved)",
      detail: `+${row.ahead}/-${row.behind} vs ${row.base}`,
      menuLabel: "Sync this branch with base",
    };
  }
  if (row.ahead === 0) {
    return {
      action: "commit",
      label: "Commit work, then sync or finish",
      detail: "Nothing ahead of base yet",
      menuLabel: "Start new work",
    };
  }
  return {
    action: "finish",
    label: "Finish or open a pull request",
    detail: `+${row.ahead} ahead of ${row.base} → merge ${row.mergeTargetDisplay}`,
    menuLabel: "Finish / merge this branch",
  };
}

/**
 * Lifecycle step ids in order (for viz highlighting).
 */
export const LIFECYCLE_ORDER = ["init", "start", "commit", "sync", "pr", "finish"] as const;

/**
 * Whether an action is a lifecycle step that can be highlighted.
 */
export function isLifecycleStep(
  action: RecommendAction,
): action is (typeof LIFECYCLE_ORDER)[number] {
  return (LIFECYCLE_ORDER as readonly string[]).includes(action);
}
