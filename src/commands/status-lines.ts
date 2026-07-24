/**
 * Structured status lines for CLI-adjacent hub panels.
 * Kept separate so `status.ts` stays focused on CLI printing.
 * @module commands/status-lines
 */

import { resolveConfig } from "../config.js";
import {
  classifyBranch,
  formatMergeTarget,
  getBaseBranchName,
  resolveMergeTarget,
} from "../flow.js";
import { getAheadBehind, getCurrentBranch, resolveRepoRoot } from "../git.js";
import { readActiveRun } from "../run-state.js";

/** One status line with optional tone for the hub panel. */
export interface StatusLine {
  text: string;
  tone?: "default" | "ok" | "bad" | "muted" | "accent";
}

/**
 * Collects human-readable status rows for the current branch.
 */
export async function collectStatusLines(cwd: string): Promise<StatusLine[]> {
  const root = await resolveRepoRoot(cwd);
  const config = resolveConfig(root, {}, {});
  const current = await getCurrentBranch(root, {});
  const active = readActiveRun(root);
  const lines: StatusLine[] = [];

  if (active) {
    lines.push({
      text: `Suspended: ${active.command} (${active.status})`,
      tone: "bad",
    });
    lines.push({
      text: "Run /continue after conflicts, or gflows abort / undo",
      tone: "muted",
    });
  }

  if (current === null) {
    lines.push({ text: "HEAD is detached.", tone: "bad" });
    lines.push({ text: "Try: git checkout dev", tone: "muted" });
    return lines;
  }

  lines.push({ text: `Branch: ${current}`, tone: "accent" });

  const classification = classifyBranch(current, config);

  if (classification === "main") {
    lines.push({ text: "Type: long-lived (main)" });
    lines.push({ text: "Next: /start feature <name> or hotfix", tone: "muted" });
    return lines;
  }

  if (classification === "dev") {
    lines.push({ text: "Type: long-lived (dev)" });
    lines.push({ text: "Next: /start feature <name>", tone: "muted" });
    return lines;
  }

  if (classification === null) {
    lines.push({ text: "Type: unknown" });
    lines.push({ text: "Use a typed prefix or /start …", tone: "muted" });
    return lines;
  }

  const mergeTarget = await resolveMergeTarget(root, current, classification, config, {});
  const baseBranch = getBaseBranchName(
    classification,
    mergeTarget === "main-then-dev" && classification === "bugfix",
    config,
  );
  const mergeTargetDisplay = formatMergeTarget(mergeTarget, config);
  const { ahead, behind } = await getAheadBehind(root, baseBranch, current, {});

  lines.push({ text: `Type: ${classification}` });
  lines.push({ text: `Base: ${baseBranch}` });
  lines.push({ text: `Merge target(s): ${mergeTargetDisplay}` });
  lines.push({ text: `Ahead/behind: ${ahead} ahead, ${behind} behind` });
  lines.push({
    text:
      ahead === 0 ? "No commits to finish yet — commit first" : `Next: /finish ${classification}`,
    tone: ahead === 0 ? "muted" : "ok",
  });

  return lines;
}
