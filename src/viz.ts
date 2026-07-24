/**
 * Terminal visualization for gflows: status panel, lifecycle, branch map.
 * Modern CLI chrome (Claude Code / Codex–style), no TUI framework.
 * @module viz
 */

import { resolveConfig } from "./config.js";
import {
  classifyBranch,
  filterWorkflowBranches,
  formatMergeTarget,
  getBaseBranchName,
  resolveMergeTarget,
} from "./flow.js";
import { branchList, getAheadBehind, getCurrentBranch, resolveRepoRoot, revParse } from "./git.js";
import { isLifecycleStep, LIFECYCLE_ORDER, recommend } from "./recommend.js";
import { readActiveRun } from "./run-state.js";
import type { BranchType, ResolvedConfig } from "./types.js";
import {
  ansi,
  chip,
  colorEnabled,
  keyHints,
  paint,
  recommendLine,
  renderPanel,
  rule,
  section,
} from "./ui.js";

/** One workflow branch row for the map. */
export interface VizBranchRow {
  name: string;
  type: BranchType | "main" | "dev" | "unknown";
  current: boolean;
  ahead: number;
  behind: number;
  base: string;
  mergeTargetDisplay: string;
}

/** Snapshot used to render the visual panel. */
export interface VizSnapshot {
  main: string;
  dev: string;
  current: string | null;
  suspended: string | null;
  /** True when main or dev is missing — need `gflows init`. */
  needsInit: boolean;
  rows: VizBranchRow[];
}

/**
 * Collects repo state for visualization.
 */
export async function collectVizSnapshot(
  cwd: string,
  overrides?: { main?: string; dev?: string; remote?: string },
): Promise<VizSnapshot> {
  const root = await resolveRepoRoot(cwd);
  const config = resolveConfig(root, overrides ?? {}, {});
  const current = await getCurrentBranch(root, {});
  const active = readActiveRun(root);
  const all = await branchList(root, { dryRun: false, verbose: false });
  const workflow = filterWorkflowBranches(all, config.prefixes);

  const mainOk = await revParse(root, config.main, [], { verbose: false }).then(
    () => true,
    () => false,
  );
  const devOk = await revParse(root, config.dev, [], { verbose: false }).then(
    () => true,
    () => false,
  );

  const rows: VizBranchRow[] = [];

  for (const name of [config.main, config.dev]) {
    if (!all.includes(name)) continue;
    rows.push({
      name,
      type: name === config.main ? "main" : "dev",
      current: current === name,
      ahead: 0,
      behind: 0,
      base: "—",
      mergeTargetDisplay: name === config.main ? "production" : "integration",
    });
  }

  for (const name of workflow) {
    const kind = classifyBranch(name, config);
    if (!kind || kind === "main" || kind === "dev") {
      rows.push({
        name,
        type: "unknown",
        current: current === name,
        ahead: 0,
        behind: 0,
        base: "—",
        mergeTargetDisplay: "—",
      });
      continue;
    }
    const base = getBaseBranchName(kind, false, config);
    const mergeTarget = await resolveMergeTarget(root, name, kind, config, {});
    const ab = await getAheadBehind(root, base, name, {});
    rows.push({
      name,
      type: kind,
      current: current === name,
      ahead: ab.ahead,
      behind: ab.behind,
      base,
      mergeTargetDisplay: formatMergeTarget(mergeTarget, config),
    });
  }

  return {
    main: config.main,
    dev: config.dev,
    current,
    suspended: active ? `${active.command} (${active.status})` : null,
    needsInit: !mainOk || !devOk,
    rows,
  };
}

/**
 * Renders a flow legend for the main/dev model.
 */
export function renderFlowLegend(config: Pick<ResolvedConfig, "main" | "dev">): string[] {
  const m = config.main;
  const d = config.dev;
  return [
    section("Flow"),
    `  ${paint(ansi.green + ansi.bold, m)}  ${paint(ansi.dim, "← release / hotfix")}`,
    `  ${paint(ansi.dim, "│")}`,
    `  ${paint(ansi.dim, "└─→")} ${paint(ansi.cyan + ansi.bold, d)}  ${paint(ansi.dim, "← feature / bugfix / chore / spike")}`,
  ];
}

/**
 * Renders an ASCII branch map highlighting the current branch.
 */
export function renderBranchMap(snap: VizSnapshot): string[] {
  const lines: string[] = [section("Branches")];
  if (snap.suspended) {
    lines.push(`  ${chip("suspended", "warn")} ${snap.suspended}`);
  }
  if (snap.needsInit) {
    lines.push(`  ${chip("setup", "warn")} missing ${snap.main} and/or ${snap.dev}`);
  }

  const longLived = snap.rows.filter((r) => r.type === "main" || r.type === "dev");
  const workflow = snap.rows.filter((r) => r.type !== "main" && r.type !== "dev");

  for (const row of longLived) {
    lines.push(formatRow(row));
  }

  if (workflow.length === 0) {
    lines.push(paint(ansi.dim, "  (no workflow branches yet)"));
  } else {
    lines.push(paint(ansi.dim, "  │"));
    for (let i = 0; i < workflow.length; i++) {
      const row = workflow[i];
      if (!row) continue;
      const last = i === workflow.length - 1;
      const elbow = last ? "└─" : "├─";
      lines.push(formatWorkflowRow(row, elbow));
    }
  }

  return lines;
}

function formatRow(row: VizBranchRow): string {
  const mark = row.current ? paint(ansi.green, "●") : paint(ansi.dim, "○");
  const name = row.current
    ? colorEnabled()
      ? `${ansi.bold}${ansi.green}${row.name}${ansi.reset}`
      : row.name
    : row.name;
  const tag =
    row.type === "main"
      ? chip("main", "warn")
      : row.type === "dev"
        ? chip("dev", "info")
        : chip(String(row.type), "muted");
  return `  ${mark} ${name}  ${tag}`;
}

function formatWorkflowRow(row: VizBranchRow, elbow: string): string {
  const mark = row.current ? paint(ansi.green, "●") : paint(ansi.dim, "○");
  const name = row.current
    ? colorEnabled()
      ? `${ansi.bold}${ansi.green}${row.name}${ansi.reset}`
      : row.name
    : row.name;
  const ab =
    row.ahead === 0 && row.behind === 0
      ? paint(ansi.dim, "synced")
      : paint(ansi.dim, `+${row.ahead}/-${row.behind} vs ${row.base}`);
  return `  ${elbow} ${mark} ${name}  ${paint(ansi.dim, `(${row.type})`)}  ${ab}`;
}

/**
 * Renders “you are here” next-step panel for the current branch.
 */
export function renderYouAreHere(snap: VizSnapshot): string[] {
  const rec = recommend(snap);
  const lines: string[] = [section("Status")];
  if (!snap.current) {
    lines.push(paint(ansi.yellow, "  HEAD detached"));
  } else {
    const row = snap.rows.find((r) => r.name === snap.current);
    lines.push(`  ${paint(ansi.green, "●")} ${paint(ansi.bold, snap.current)}`);
    if (row) {
      lines.push(
        paint(
          ansi.dim,
          `  type ${row.type}  ·  base ${row.base}  ·  merge ${row.mergeTargetDisplay}`,
        ),
      );
      if (row.type !== "main" && row.type !== "dev" && row.type !== "unknown") {
        lines.push(paint(ansi.dim, `  ahead/behind  +${row.ahead} / -${row.behind}`));
      }
    }
  }
  lines.push(`  ${recommendLine(rec.label)}`);
  lines.push(paint(ansi.dim, `    ${rec.detail}`));
  return lines;
}

/**
 * Lifecycle guide strip with current step emphasized.
 */
export function renderLifecycle(snap: VizSnapshot): string[] {
  const rec = recommend(snap);
  const highlight = isLifecycleStep(rec.action) ? rec.action : null;
  const path = LIFECYCLE_ORDER.map((step) =>
    highlight === step ? paint(ansi.green + ansi.bold, step) : paint(ansi.dim, step),
  ).join(paint(ansi.dim, " → "));
  return [section("Lifecycle"), `  ${path}`];
}

/**
 * Full visual panel as printable lines (for hub or `gflows viz`).
 */
export function renderVizPanel(snap: VizSnapshot): string[] {
  const rec = recommend(snap);
  const where = snap.current ?? "detached";
  const headerBody = [
    `${paint(ansi.green, "●")} ${paint(ansi.bold, where)}  ${chip(snap.needsInit ? "needs init" : "ready", snap.needsInit ? "warn" : "ok")}`,
    recommendLine(rec.label),
    paint(ansi.dim, rec.detail),
  ];

  return [
    "",
    ...renderPanel("gflows", headerBody),
    "",
    ...renderLifecycle(snap),
    "",
    ...renderFlowLegend({ main: snap.main, dev: snap.dev }),
    "",
    ...renderBranchMap(snap),
    "",
    ...renderYouAreHere(snap),
    "",
    rule(56),
    `  ${keyHints([
      ["↑↓", "move"],
      ["enter", "select"],
      ["ctrl+c", "exit"],
    ])}`,
    "",
  ];
}

/**
 * Prints the visual panel to stdout.
 */
export async function printViz(
  cwd: string,
  overrides?: { main?: string; dev?: string; remote?: string },
): Promise<VizSnapshot> {
  const snap = await collectVizSnapshot(cwd, overrides);
  for (const line of renderVizPanel(snap)) {
    console.log(line);
  }
  return snap;
}
