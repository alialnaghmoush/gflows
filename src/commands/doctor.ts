/**
 * Doctor: check whether the repo is ready for gflows workflows.
 * @module commands/doctor
 */

import { readConfigFile, resolveConfig } from "../config.js";
import {
  getCurrentBranch,
  isClean,
  isDetachedHead,
  isRebaseOrMergeInProgress,
  resolveRepoRoot,
  revParse,
  runGit,
} from "../git.js";
import { hint, success } from "../out.js";
import { readActiveRun } from "../run-state.js";
import type { ParsedArgs } from "../types.js";

interface Check {
  ok: boolean;
  name: string;
  detail: string;
}

/**
 * Runs health checks and prints a report (or JSON).
 */
export async function run(args: ParsedArgs): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await resolveRepoRoot(args.cwd);
  } catch (err) {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, error: String(err) }, null, 2));
      process.exit(2);
    }
    throw err;
  }

  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );
  const cfgRead = readConfigFile(repoRoot);
  const checks: Check[] = [];

  checks.push({
    ok: true,
    name: "git-repo",
    detail: repoRoot,
  });

  const mainOk = await revParse(repoRoot, config.main, [], { verbose: false }).then(
    () => true,
    () => false,
  );
  checks.push({
    ok: mainOk,
    name: "main-branch",
    detail: mainOk ? `found '${config.main}'` : `missing '${config.main}' — create it first`,
  });

  const devOk = await revParse(repoRoot, config.dev, [], { verbose: false }).then(
    () => true,
    () => false,
  );
  checks.push({
    ok: devOk,
    name: "dev-branch",
    detail: devOk ? `found '${config.dev}'` : `missing '${config.dev}' — run gflows init`,
  });

  const remoteList = await runGit(["remote"], { cwd: repoRoot });
  const hasRemote = remoteList.stdout
    .split("\n")
    .map((s) => s.trim())
    .includes(config.remote);
  checks.push({
    ok: hasRemote,
    name: "remote",
    detail: hasRemote
      ? `remote '${config.remote}' configured`
      : `remote '${config.remote}' missing (push will fail)`,
  });

  checks.push({
    ok: !cfgRead.invalid,
    name: "config",
    detail: cfgRead.invalid
      ? "config file invalid — using defaults"
      : cfgRead.config
        ? "config loaded"
        : "using defaults (no .gflows.json)",
  });

  const detached = await isDetachedHead(repoRoot);
  checks.push({
    ok: !detached,
    name: "head",
    detail: detached ? "detached HEAD" : `on ${(await getCurrentBranch(repoRoot)) ?? "?"}`,
  });

  const inProgress = isRebaseOrMergeInProgress(repoRoot);
  const active = readActiveRun(repoRoot);
  checks.push({
    ok: !inProgress && !active,
    name: "run-state",
    detail: active
      ? `suspended '${active.command}' — gflows continue | abort | undo`
      : inProgress
        ? "git merge/rebase in progress — gflows continue or abort"
        : "clean",
  });

  const clean = await isClean(repoRoot);
  checks.push({
    ok: true,
    name: "working-tree",
    detail: clean ? "clean" : "dirty (uncommitted changes)",
  });

  const ok = checks.every((c) => c.ok);

  if (args.json) {
    console.log(JSON.stringify({ ok, config, checks }, null, 2));
    if (!ok) process.exit(2);
    return;
  }

  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`${mark} ${c.name}: ${c.detail}`);
  }
  if (ok) {
    if (!args.quiet) success("gflows doctor: all critical checks passed.");
  } else {
    console.error("gflows doctor: some checks failed.");
    hint("Fix the ✗ items, then retry. Run gflows init if dev is missing.");
    process.exit(2);
  }
}
