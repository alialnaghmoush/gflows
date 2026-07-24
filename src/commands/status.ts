/**
 * Status command: show current branch flow info and recovery hints.
 * @module commands/status
 */

import { resolveConfig } from "../config.js";
import { NotRepoError } from "../errors.js";
import {
  classifyBranch,
  formatMergeTarget,
  getBaseBranchName,
  resolveMergeTarget,
} from "../flow.js";
import { getAheadBehind, getCurrentBranch, resolveRepoRoot } from "../git.js";
import { hint } from "../out.js";
import { readActiveRun } from "../run-state.js";
import type { ParsedArgs } from "../types.js";

/**
 * Runs the status command.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, dryRun, verbose, quiet, json } = args;

  const root = await resolveRepoRoot(cwd).catch((err: unknown) => {
    if (err instanceof NotRepoError) throw err;
    throw err;
  });

  const config = resolveConfig(
    root,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: !!verbose },
  );
  const current = await getCurrentBranch(root, {
    dryRun: !!dryRun,
    verbose: !!verbose,
  });

  const active = readActiveRun(root);

  if (json) {
    const payload: Record<string, unknown> = {
      branch: current,
      suspended: active
        ? { command: active.command, status: active.status, nextStep: active.nextStep }
        : null,
    };
    if (current) {
      const classification = classifyBranch(current, config);
      payload.type = classification;
      if (classification && classification !== "main" && classification !== "dev") {
        const mergeTarget = await resolveMergeTarget(root, current, classification, config, {
          dryRun: !!dryRun,
          verbose: !!verbose,
        });
        const base = getBaseBranchName(classification, false, config);
        const ab = await getAheadBehind(root, base, current, {
          dryRun: !!dryRun,
          verbose: !!verbose,
        });
        payload.base = base;
        payload.mergeTarget = mergeTarget;
        payload.mergeTargetDisplay = formatMergeTarget(mergeTarget, config);
        payload.ahead = ab.ahead;
        payload.behind = ab.behind;
      }
    }
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (active && !quiet) {
    console.log(`Suspended: ${active.command} (${active.status})`);
    hint("Run gflows continue after resolving conflicts, or gflows abort / undo.");
  }

  if (current === null) {
    if (!quiet) {
      console.log("HEAD is detached.");
      hint("Try: git checkout dev");
    }
    return;
  }

  if (!quiet) {
    console.log(`Branch: ${current}`);
  }

  const classification = classifyBranch(current, config);

  if (classification === "main") {
    if (!quiet) {
      console.log("Type: long-lived (main)");
      hint("Run gflows start feature <name> or gflows start hotfix vX.Y.Z");
    }
    return;
  }

  if (classification === "dev") {
    if (!quiet) {
      console.log("Type: long-lived (dev)");
      hint("Run gflows start feature <name> to begin work.");
    }
    return;
  }

  if (classification === null) {
    if (!quiet) {
      console.log("Type: unknown");
      hint("Use a typed prefix (feature/, bugfix/, …) or gflows start …");
    }
    return;
  }

  const mergeTarget = await resolveMergeTarget(root, current, classification, config, {
    dryRun: !!dryRun,
    verbose: !!verbose,
  });
  const baseBranch = getBaseBranchName(
    classification,
    mergeTarget === "main-then-dev" && classification === "bugfix",
    config,
  );
  const mergeTargetDisplay = formatMergeTarget(mergeTarget, config);

  if (!quiet) {
    console.log(`Type: ${classification}`);
    console.log(`Base: ${baseBranch}`);
    console.log(`Merge target(s): ${mergeTargetDisplay}`);
  }

  const { ahead, behind } = await getAheadBehind(root, baseBranch, current, {
    dryRun: !!dryRun,
    verbose: !!verbose,
  });

  if (!quiet) {
    console.log(`Ahead/behind: ${ahead} ahead, ${behind} behind`);
    if (ahead === 0) {
      hint("No commits to finish yet — commit changes first.");
    } else {
      hint(`Run gflows finish ${classification} to merge into ${mergeTargetDisplay}.`);
    }
  }
}
