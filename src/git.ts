/**
 * Git layer for gflows: safe wrappers around `git` via Bun.spawn.
 * All operations use resolved repo root (cwd). Supports dry-run (log only) and verbose (echo commands).
 * Throws typed errors from ./errors.js. Helpers for detached HEAD and rebase/merge-in-progress guards.
 * @module git
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { INVALID_BRANCH_CHARS } from "./constants.js";
import {
  BranchNotFoundError,
  DetachedHeadError,
  InvalidBranchNameError,
  MergeConflictError,
  NotRepoError,
  RebaseMergeInProgressError,
} from "./errors.js";

/** Options for git operations: repo path, dry-run (log only), and verbose (echo commands). */
export interface GitOptions {
  /** Resolved repo root (absolute path). */
  cwd: string;
  /** If true, do not run git; only log the command that would run. */
  dryRun?: boolean;
  /** If true, echo each git command to stderr. */
  verbose?: boolean;
}

/** Options for git helpers that take cwd as first param (no cwd in options). */
export type GitRunOptions = Pick<GitOptions, "dryRun" | "verbose">;

/** Result of running a git command (stdout, stderr, exit code). */
export interface GitRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Runs a git command via Bun.spawn. When dryRun is true, logs the command and returns success without running.
 * When verbose is true, echoes the command to stderr before running.
 *
 * @param args - Git arguments (e.g. ["checkout", "main"]).
 * @param options - cwd, dryRun, verbose.
 * @returns Promise with stdout, stderr, and exitCode.
 */
export async function runGit(args: string[], options: GitOptions): Promise<GitRunResult> {
  const { cwd, dryRun = false, verbose = false } = options;
  const cmd = ["git", ...args].join(" ");

  if (dryRun) {
    console.error(`gflows (dry-run): ${cmd}`);
    return { stdout: "", stderr: "", exitCode: 0 };
  }

  if (verbose) {
    console.error(`gflows: ${cmd}`);
  }

  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Resolves the Git repository root for the given directory. If cwd is not inside a repo, throws NotRepoError.
 *
 * @param cwd - Directory to resolve from (e.g. process.cwd() or resolved -C path).
 * @returns Absolute path to the repository root.
 * @throws NotRepoError when cwd is not a Git repository.
 */
export async function resolveRepoRoot(cwd: string): Promise<string> {
  const dir = resolve(cwd);
  const result = await runGit(["rev-parse", "--show-toplevel"], {
    cwd: dir,
    dryRun: false,
    verbose: false,
  });

  if (result.exitCode !== 0) {
    throw new NotRepoError("Not a Git repository.");
  }

  const root = result.stdout.trim();
  if (!root) {
    throw new NotRepoError("Not a Git repository.");
  }

  return root;
}

/**
 * Ensures the given path is an existing directory and contains .git (or is the root reported by rev-parse).
 * Use after resolveRepoRoot to validate, or use resolveRepoRoot which already validates.
 * For pre-check "is cwd a git repo?", use resolveRepoRoot and catch NotRepoError.
 *
 * @param dir - Absolute path to directory.
 * @throws NotRepoError if dir is not a directory or not a Git repo.
 */
export function ensureGitRepo(dir: string): void {
  const resolved = resolve(dir);
  const gitDir = `${resolved}/.git`;
  if (!existsSync(resolved) || !existsSync(gitDir)) {
    throw new NotRepoError("Not a Git repository.");
  }
}

/**
 * Runs git rev-parse with the given ref and optional extra args.
 *
 * @param cwd - Repo root.
 * @param ref - Ref to parse (e.g. "HEAD", "main", "origin/dev").
 * @param extraArgs - Extra args (e.g. ["--abbrev-ref"]).
 * @param options - dryRun, verbose.
 * @returns Trimmed stdout.
 * @throws BranchNotFoundError when ref does not exist (exit code 128 or similar).
 */
export async function revParse(
  cwd: string,
  ref: string,
  extraArgs: string[] = [],
  options: Pick<GitOptions, "dryRun" | "verbose"> = {},
): Promise<string> {
  const result = await runGit(["rev-parse", ...extraArgs, ref], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new BranchNotFoundError(`Ref '${ref}' not found.`);
  }
  return result.stdout.trim();
}

/**
 * Lists local branch names. With includeRemote, fetches and includes remote-tracking branches.
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose; includeRemote to add -r and optionally fetch.
 * @returns Branch names (local only, or with remotes if includeRemote).
 */
export async function branchList(
  cwd: string,
  options: GitRunOptions & { includeRemote?: boolean } = {},
): Promise<string[]> {
  const { includeRemote = false, ...opts } = options;
  const args = includeRemote
    ? ["branch", "-a", "--format=%(refname:short)"]
    : ["branch", "--list", "--format=%(refname:short)"];

  const result = await runGit(args, { cwd, ...opts });
  if (result.exitCode !== 0) {
    return [];
  }

  const lines = result.stdout.trim() ? result.stdout.trim().split(/\n/) : [];
  const names = lines
    .map((line) => line.replace(/^remotes\/[^/]+\//, "").trim())
    .filter((name) => name && !name.startsWith("* "));
  const dedup = [...new Set(names)];
  return dedup.sort();
}

/**
 * Checks out the given branch.
 *
 * @param cwd - Repo root.
 * @param branch - Branch name to checkout.
 * @param options - dryRun, verbose.
 * @throws BranchNotFoundError if branch does not exist.
 */
export async function checkout(
  cwd: string,
  branch: string,
  options: GitRunOptions = {},
): Promise<void> {
  const result = await runGit(["checkout", branch], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new BranchNotFoundError(`Branch '${branch}' not found or checkout failed.`);
  }
}

/**
 * Merges the given ref into the current branch. Uses --no-ff when requested.
 *
 * @param cwd - Repo root.
 * @param ref - Ref to merge (branch or commit).
 * @param options - dryRun, verbose, noFf.
 * @throws MergeConflictError when merge has conflicts (exit code 1 and conflict hint in stderr).
 */
export async function merge(
  cwd: string,
  ref: string,
  options: GitRunOptions & { noFf?: boolean } = {},
): Promise<void> {
  const { noFf = false, ...opts } = options;
  const args = noFf ? ["merge", "--no-ff", ref] : ["merge", ref];
  const result = await runGit(args, { cwd, ...opts });

  if (result.exitCode !== 0) {
    const hint =
      "Resolve conflicts in the working tree, then run `git add` and `git merge --continue`, or `git merge --abort` to cancel. Re-run `gflows finish` after resolving if needed.";
    throw new MergeConflictError(`Merge conflict while merging ${ref}. ${hint}`);
  }
}

/**
 * Pushes refs and optionally tags to the remote.
 *
 * @param cwd - Repo root.
 * @param remote - Remote name (e.g. "origin").
 * @param refs - Refs to push (e.g. ["main", "dev"] or []);
 * @param pushTags - If true, also push tags (e.g. --follow-tags or separate push --tags).
 * @param options - dryRun, verbose.
 * @returns Exit code from git push (0 = success).
 */
export async function push(
  cwd: string,
  remote: string,
  refs: string[],
  pushTags: boolean,
  options: GitRunOptions = {},
): Promise<number> {
  const pushArgs = ["push", remote, ...refs];
  const result = await runGit(pushArgs, { cwd, ...options });
  if (result.exitCode !== 0) {
    return result.exitCode;
  }
  if (pushTags) {
    const tagResult = await runGit(["push", remote, "--tags"], { cwd, ...options });
    return tagResult.exitCode;
  }
  return 0;
}

/**
 * Creates a tag at the current HEAD. Optionally signed and with a message.
 *
 * @param cwd - Repo root.
 * @param name - Tag name (e.g. "v1.2.3").
 * @param options - dryRun, verbose, sign, tagMessage.
 * @throws Error when tag already exists or creation fails.
 */
export async function tag(
  cwd: string,
  name: string,
  options: GitRunOptions & { sign?: boolean; tagMessage?: string } = {},
): Promise<void> {
  const { sign = false, tagMessage, ...opts } = options;
  const args = ["tag", name];
  if (sign) args.push("-s");
  if (tagMessage) args.push("-m", tagMessage);

  const result = await runGit(args, { cwd, ...opts });
  if (result.exitCode !== 0) {
    if (result.stderr.includes("already exists")) {
      throw new Error(`Tag ${name} already exists.`);
    }
    throw new Error(result.stderr.trim() || `Failed to create tag ${name}.`);
  }
}

/**
 * Returns true if a tag with the given name exists.
 *
 * @param cwd - Repo root.
 * @param name - Tag name.
 * @param options - dryRun, verbose (verbose has no effect for this read-only call).
 */
export async function tagExists(
  cwd: string,
  name: string,
  options: GitRunOptions = {},
): Promise<boolean> {
  const result = await runGit(["tag", "-l", name], { cwd, ...options });
  return result.exitCode === 0 && result.stdout.trim() === name;
}

/**
 * Deletes a local branch. Does not delete main/dev; callers must guard.
 *
 * @param cwd - Repo root.
 * @param branch - Branch name to delete.
 * @param options - dryRun, verbose.
 * @throws BranchNotFoundError if branch does not exist or delete fails.
 */
export async function deleteBranch(
  cwd: string,
  branch: string,
  options: GitRunOptions = {},
): Promise<void> {
  const result = await runGit(["branch", "-d", branch], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new BranchNotFoundError(result.stderr.trim() || `Could not delete branch '${branch}'.`);
  }
}

/**
 * Returns true if the working tree is clean (no uncommitted changes).
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose (verbose has no effect for this read-only call).
 */
export async function isClean(cwd: string, options: GitRunOptions = {}): Promise<boolean> {
  const result = await runGit(["status", "--porcelain"], { cwd, ...options });
  if (result.exitCode !== 0) return false;
  return result.stdout.trim() === "";
}

/** Stash message prefix for per-branch switch restore. Full message: gflows-switch:<branchName>. */
export const STASH_SWITCH_PREFIX = "gflows-switch:";

/**
 * Stashes uncommitted changes (including untracked) for the given branch (git stash push -u -m "gflows-switch:<branch>").
 * Used for per-branch restore so the stash can be found and applied when switching back.
 * Callers that want at most one stash per branch should drop an existing stash for that branch
 * (findStashRefByBranch + stashDropRef) before calling this.
 *
 * @param cwd - Repo root.
 * @param branchName - Branch name to tag the stash with.
 * @param options - dryRun, verbose.
 * @throws Error if stash fails.
 */
export async function stashPush(
  cwd: string,
  branchName: string,
  options: GitRunOptions = {},
): Promise<void> {
  const message = `${STASH_SWITCH_PREFIX}${branchName}`;
  const result = await runGit(["stash", "push", "-u", "-m", message], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "git stash push failed.");
  }
}

/**
 * Returns the stash ref (e.g. stash@{0}) for the most recent stash tagged with gflows-switch:<branchName>, or null.
 * Parses `git stash list` and matches the message; stash list is newest-first.
 *
 * @param cwd - Repo root.
 * @param branchName - Branch name (stash message is gflows-switch:<branchName>).
 * @param options - dryRun, verbose.
 */
export async function findStashRefByBranch(
  cwd: string,
  branchName: string,
  options: GitRunOptions = {},
): Promise<string | null> {
  const result = await runGit(["stash", "list"], { cwd, ...options });
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  const tag = `${STASH_SWITCH_PREFIX}${branchName}`;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}(?:[\\s:]|$)`);
  for (const line of result.stdout.trim().split("\n")) {
    const match = line.match(/^(stash@\{\d+\})/);
    const ref = match?.[1];
    if (ref && re.test(line)) return ref;
  }
  return null;
}

/** Stash message used for "move changes to target" (one-off stash, popped after checkout). */
const STASH_SWITCH_MOVE_MESSAGE = "gflows-switch-move";

/**
 * Stashes uncommitted changes (including untracked) for "move to target" flow (git stash push -u -m "<move message>").
 * The stash is popped on the target branch; use findStashRefByMessage + stashPopRef after checkout.
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose.
 * @throws Error if stash fails.
 */
export async function stashPushMove(cwd: string, options: GitRunOptions = {}): Promise<void> {
  const result = await runGit(["stash", "push", "-u", "-m", STASH_SWITCH_MOVE_MESSAGE], {
    cwd,
    ...options,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "git stash push failed.");
  }
}

/**
 * Returns the stash ref (e.g. stash@{0}) for the most recent stash whose message contains the given substring, or null.
 * Used to find the "move" stash after checkout.
 *
 * @param cwd - Repo root.
 * @param messageSubstring - Substring to search for in stash list lines.
 * @param options - dryRun, verbose.
 */
export async function findStashRefByMessage(
  cwd: string,
  messageSubstring: string,
  options: GitRunOptions = {},
): Promise<string | null> {
  const result = await runGit(["stash", "list"], { cwd, ...options });
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  for (const line of result.stdout.trim().split("\n")) {
    if (!line.includes(messageSubstring)) continue;
    const match = line.match(/^(stash@\{\d+\})/);
    const ref = match?.[1];
    if (ref) return ref;
  }
  return null;
}

/** Message substring used to find the "move" stash after checkout (internal). */
export const STASH_SWITCH_MOVE_SUBSTRING = "gflows-switch-move";

/**
 * Pops a specific stash by ref (e.g. stash@{0}). Used to restore per-branch stash for target branch.
 * On success the stash is removed. On conflict Git keeps the stash so the user can retry or drop it.
 *
 * @param cwd - Repo root.
 * @param stashRef - Stash ref from findStashRefByBranch (e.g. "stash@{0}").
 * @param options - dryRun, verbose.
 * @throws Error if stash pop fails (e.g. merge conflicts).
 */
export async function stashPopRef(
  cwd: string,
  stashRef: string,
  options: GitRunOptions = {},
): Promise<void> {
  const result = await runGit(["stash", "pop", stashRef], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git stash pop ${stashRef} failed.`);
  }
}

/**
 * Drops a specific stash by ref (e.g. stash@{0}). Used to overwrite per-branch stash before pushing a new one.
 *
 * @param cwd - Repo root.
 * @param stashRef - Stash ref (e.g. "stash@{0}").
 * @param options - dryRun, verbose.
 * @throws Error if stash drop fails.
 */
export async function stashDropRef(
  cwd: string,
  stashRef: string,
  options: GitRunOptions = {},
): Promise<void> {
  const result = await runGit(["stash", "drop", stashRef], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git stash drop ${stashRef} failed.`);
  }
}

/**
 * Discards tracked changes in the working tree (git restore .). Does not remove untracked files.
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose.
 * @throws Error if restore fails.
 */
export async function restoreTracked(cwd: string, options: GitRunOptions = {}): Promise<void> {
  const result = await runGit(["restore", "."], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "git restore . failed.");
  }
}

/**
 * Removes untracked files and directories (git clean -fd).
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose.
 * @throws Error if clean fails.
 */
export async function cleanUntracked(cwd: string, options: GitRunOptions = {}): Promise<void> {
  const result = await runGit(["clean", "-fd"], { cwd, ...options });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "git clean -fd failed.");
  }
}

/**
 * Returns the current branch name, or null if HEAD is detached.
 *
 * @param cwd - Repo root.
 * @param options - dryRun, verbose.
 */
export async function getCurrentBranch(
  cwd: string,
  options: GitRunOptions = {},
): Promise<string | null> {
  const result = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    ...options,
  });
  if (result.exitCode !== 0) return null;
  const name = result.stdout.trim();
  if (name === "HEAD" || !name) return null;
  return name;
}

/**
 * Returns true if HEAD is detached (not on a branch).
 *
 * @param cwd - Repo root.
 */
export async function isDetachedHead(cwd: string): Promise<boolean> {
  const branch = await getCurrentBranch(cwd);
  return branch === null;
}

/**
 * Returns true if a rebase or merge is in progress (.git/rebase-merge, .git/rebase-apply, or .git/MERGE_HEAD).
 *
 * @param cwd - Repo root (must be repo root so .git is directly under it).
 */
export function isRebaseOrMergeInProgress(cwd: string): boolean {
  const root = resolve(cwd);
  return (
    existsSync(`${root}/.git/rebase-merge`) ||
    existsSync(`${root}/.git/rebase-apply`) ||
    existsSync(`${root}/.git/MERGE_HEAD`)
  );
}

/**
 * Asserts that HEAD is not detached; throws DetachedHeadError if it is.
 *
 * @param cwd - Repo root.
 * @throws DetachedHeadError when HEAD is detached.
 */
export async function assertNotDetached(cwd: string): Promise<void> {
  if (await isDetachedHead(cwd)) {
    throw new DetachedHeadError();
  }
}

/**
 * Asserts that no rebase or merge is in progress; throws RebaseMergeInProgressError if one is.
 *
 * @param cwd - Repo root.
 * @throws RebaseMergeInProgressError when rebase/merge is in progress.
 */
export function assertNoRebaseOrMerge(cwd: string): void {
  if (isRebaseOrMergeInProgress(cwd)) {
    throw new RebaseMergeInProgressError();
  }
}

/**
 * Validates a branch name: non-empty, no whitespace-only, no invalid ref characters.
 * Use for feature/bugfix/chore/spike names; for release/hotfix validate version separately.
 *
 * @param name - Branch name segment (e.g. "my-feat").
 * @throws InvalidBranchNameError when name is empty, whitespace, or contains invalid characters.
 */
export function validateBranchName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new InvalidBranchNameError("Branch name cannot be empty or whitespace.");
  }
  if (INVALID_BRANCH_CHARS.test(name)) {
    throw new InvalidBranchNameError(
      "Branch name contains invalid characters (e.g. .., ~, ^, ?, *, [, ], :, \\, space).",
    );
  }
}

/**
 * Fetches from the given remote so refs are up to date (e.g. before checking if base exists).
 *
 * @param cwd - Repo root.
 * @param remote - Remote name (e.g. "origin").
 * @param options - dryRun, verbose.
 * @returns Exit code from git fetch.
 */
export async function fetch(
  cwd: string,
  remote: string,
  options: GitRunOptions = {},
): Promise<number> {
  const result = await runGit(["fetch", remote], { cwd, ...options });
  return result.exitCode;
}

/**
 * Returns the default remote name from config; the git layer does not read config.
 * Callers should use resolveConfig().remote. This helper exists for documentation;
 * for "remote name" the CLI uses config. For listing remote refs, use branchList with includeRemote
 * or run git ls-remote. Exposed for completeness: getRemoteRef checks if a ref exists on remote.
 *
 * @param cwd - Repo root.
 * @param remote - Remote name.
 * @param ref - Branch name on remote (e.g. "main").
 * @param options - dryRun, verbose.
 * @returns True if remote has that ref.
 */
export async function hasRemoteRef(
  cwd: string,
  remote: string,
  ref: string,
  options: GitRunOptions = {},
): Promise<boolean> {
  const result = await runGit(["ls-remote", "--exit-code", remote, ref], {
    cwd,
    ...options,
  });
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

/**
 * Returns how many commits headRef is ahead of and behind baseRef (symmetric difference).
 * Uses `git rev-list --left-right --count base...head`; first number is behind, second is ahead.
 *
 * @param cwd - Repo root.
 * @param baseRef - Base ref (e.g. "dev" or "main").
 * @param headRef - Head ref (e.g. current branch).
 * @param options - dryRun, verbose.
 * @returns { ahead, behind } counts; both 0 if refs are the same or on error.
 */
export async function getAheadBehind(
  cwd: string,
  baseRef: string,
  headRef: string,
  options: GitRunOptions = {},
): Promise<{ ahead: number; behind: number }> {
  const result = await runGit(["rev-list", "--left-right", "--count", `${baseRef}...${headRef}`], {
    cwd,
    ...options,
  });
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return { ahead: 0, behind: 0 };
  }
  const parts = result.stdout.trim().split(/\s+/);
  const behind = Math.max(0, parseInt(parts[0] ?? "0", 10) || 0);
  const ahead = Math.max(0, parseInt(parts[1] ?? "0", 10) || 0);
  return { ahead, behind };
}
