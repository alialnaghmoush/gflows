/**
 * Shared branch classification and merge-target resolution for status/finish/sync/pr.
 * @module flow
 */

import { getBranchTypeMeta } from "./config.js";
import { VERSION_REGEX } from "./constants.js";
import { getMergeBase, isAncestor, resolveSha } from "./git.js";
import type { BranchType, MergeTarget, ResolvedConfig } from "./types.js";

/**
 * Classifies a branch name into a workflow type, "main", "dev", or null (unknown).
 */
export function classifyBranch(
  branchName: string,
  config: ResolvedConfig,
): BranchType | "main" | "dev" | null {
  if (branchName === config.main) return "main";
  if (branchName === config.dev) return "dev";
  const { prefixes } = config;
  const order: BranchType[] = ["release", "hotfix", "feature", "bugfix", "chore", "spike"];
  for (const type of order) {
    const prefix = prefixes[type];
    if (prefix && branchName.startsWith(prefix)) {
      return type;
    }
  }
  return null;
}

/**
 * Infers branch type and optional version from branch name using config prefixes.
 */
export function parseBranchTypeAndVersion(
  branchName: string,
  prefixes: ResolvedConfig["prefixes"],
): { type: BranchType; version?: string } | null {
  const order: BranchType[] = ["release", "hotfix", "feature", "bugfix", "chore", "spike"];
  for (const type of order) {
    const prefix = prefixes[type];
    if (prefix && branchName.startsWith(prefix)) {
      const suffix = branchName.slice(prefix.length);
      if (type === "release" || type === "hotfix") {
        const ver = suffix.trim();
        return VERSION_REGEX.test(ver) ? { type, version: ver } : { type };
      }
      return { type };
    }
  }
  return null;
}

/**
 * Formats merge target for display using actual branch names.
 */
export function formatMergeTarget(mergeTarget: MergeTarget, config: ResolvedConfig): string {
  if (mergeTarget === "main-then-dev") {
    return `${config.main}, then ${config.dev}`;
  }
  return mergeTarget === "main" ? config.main : config.dev;
}

/**
 * Primary compare/merge base branch for a merge target (for ahead/behind and empty-finish checks).
 */
export function primaryTargetBranch(mergeTarget: MergeTarget, config: ResolvedConfig): string {
  if (mergeTarget === "dev") return config.dev;
  return config.main;
}

/**
 * Resolves effective merge target for a workflow branch.
 * Bugfix branches based on main (merge-base equals main tip, or only reachable from main) use main-then-dev.
 */
export async function resolveMergeTarget(
  repoRoot: string,
  branchName: string,
  type: BranchType,
  config: ResolvedConfig,
  opts: { dryRun?: boolean; verbose?: boolean } = {},
): Promise<MergeTarget> {
  const meta = getBranchTypeMeta(type);
  if (type !== "bugfix") {
    return meta.mergeTarget;
  }

  const mainSha = await resolveSha(repoRoot, config.main, opts);
  const branchSha = await resolveSha(repoRoot, branchName, opts);
  if (!mainSha || !branchSha) {
    return meta.mergeTarget;
  }

  const mergeBase = await getMergeBase(repoRoot, config.main, branchName, opts);
  if (mergeBase && mergeBase === mainSha) {
    return "main-then-dev";
  }

  // Also treat as from-main when main is ancestor and dev is not the merge-base with branch
  const mainIsAncestor = await isAncestor(repoRoot, config.main, branchName, opts);
  const devSha = await resolveSha(repoRoot, config.dev, opts);
  if (mainIsAncestor && devSha) {
    const baseWithDev = await getMergeBase(repoRoot, config.dev, branchName, opts);
    // If branch diverged from main more recently than from dev tip equality check:
    // when merge-base(main, branch) === main tip, already handled; if branch was created
    // from main while main had moved from where dev is, merge-base with main is still main's tip at start.
    if (baseWithDev && mergeBase && baseWithDev !== mergeBase && mergeBase === mainSha) {
      return "main-then-dev";
    }
    // Heuristic: if merge-base with main equals main and differs from merge-base with dev → from main
    if (mergeBase === mainSha && baseWithDev !== mainSha) {
      return "main-then-dev";
    }
  }

  return meta.mergeTarget;
}

/**
 * Default base branch name for a type (and optional fromMain).
 */
export function getBaseBranchName(
  type: BranchType,
  fromMain: boolean,
  config: ResolvedConfig,
): string {
  if (type === "hotfix") return config.main;
  if (type === "bugfix" && fromMain) return config.main;
  const meta = getBranchTypeMeta(type);
  return meta.base === "main" ? config.main : config.dev;
}

/**
 * Normalizes version to vX.Y.Z for tag name.
 */
export function normalizeTagVersion(version: string): string {
  const v = version.trim();
  return v.startsWith("v") ? v : `v${v}`;
}

/**
 * Lists local workflow branches matching configured prefixes.
 */
export function filterWorkflowBranches(
  all: string[],
  prefixes: ResolvedConfig["prefixes"],
): string[] {
  const workflow: string[] = [];
  for (const b of all) {
    for (const prefix of Object.values(prefixes)) {
      if (b.startsWith(prefix)) {
        workflow.push(b);
        break;
      }
    }
  }
  return workflow.sort();
}
