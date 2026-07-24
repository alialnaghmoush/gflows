/**
 * Open a pull/merge request against the correct merge target via gh or glab.
 * @module commands/pr
 */

import { resolveConfig } from "../config.js";
import { EXIT_GIT, EXIT_USER } from "../constants.js";
import {
  classifyBranch,
  formatMergeTarget,
  parseBranchTypeAndVersion,
  primaryTargetBranch,
  resolveMergeTarget,
} from "../flow.js";
import { assertNotDetached, getCurrentBranch, push, resolveRepoRoot, runGit } from "../git.js";
import { hint, success } from "../out.js";
import type { ParsedArgs } from "../types.js";

async function which(cmd: string): Promise<boolean> {
  const r = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
  await r.exited;
  return r.exitCode === 0;
}

/**
 * Creates a PR/MR for the current (or named) workflow branch.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );
  const opts = { dryRun: args.dryRun, verbose: args.verbose };

  await assertNotDetached(repoRoot);
  const branch =
    (typeof args.branch === "string" && args.branch.trim()) ||
    args.name ||
    (await getCurrentBranch(repoRoot, opts));
  if (!branch) {
    console.error("gflows pr: no branch. Checkout a workflow branch or pass -B <name>.");
    process.exit(EXIT_USER);
  }

  const classification = classifyBranch(branch, config);
  if (classification === "main" || classification === "dev" || classification === null) {
    console.error(`gflows pr: '${branch}' is not a workflow branch.`);
    process.exit(EXIT_USER);
  }

  const parsed = parseBranchTypeAndVersion(branch, config.prefixes);
  const type = parsed?.type ?? classification;
  const mergeTarget = await resolveMergeTarget(repoRoot, branch, type, config, opts);
  const base = primaryTargetBranch(mergeTarget, config);

  const hasGh = await which("gh");
  const hasGlab = await which("glab");
  if (!hasGh && !hasGlab) {
    console.error("gflows pr: neither `gh` nor `glab` found on PATH.");
    hint("Install GitHub CLI (gh) or GitLab CLI (glab), then retry.");
    process.exit(EXIT_GIT);
  }

  console.error("gflows pr plan:");
  console.error(`  head: ${branch}`);
  console.error(`  base: ${base}`);
  console.error(`  via:  ${hasGh ? "gh" : "glab"}`);

  if (args.dryRun || args.preview) {
    success("gflows: preview only (no PR created).");
    return;
  }

  // Ensure upstream
  const remote = args.remote ?? config.remote;
  const pushCode = await push(repoRoot, remote, [branch], false, opts);
  if (pushCode !== 0) {
    // try set upstream
    const r = await runGit(["push", "-u", remote, branch], { cwd: repoRoot, ...opts });
    if (r.exitCode !== 0) {
      console.error("gflows pr: failed to push branch to remote.");
      process.exit(EXIT_GIT);
    }
  }

  const title = branch;
  if (hasGh) {
    const proc = Bun.spawn(
      ["gh", "pr", "create", "--base", base, "--head", branch, "--title", title, "--body", ""],
      { cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) process.exit(EXIT_GIT);
  } else {
    const proc = Bun.spawn(
      [
        "glab",
        "mr",
        "create",
        "--target-branch",
        base,
        "--source-branch",
        branch,
        "--title",
        title,
        "--yes",
      ],
      { cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) process.exit(EXIT_GIT);
  }

  if (!args.quiet) {
    success(`gflows: opened PR/MR for '${branch}' → ${base}.`);
    hint(`Merge target(s) for this type: ${formatMergeTarget(mergeTarget, config)}.`);
  }
}
