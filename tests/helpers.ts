/**
 * Test helpers: run gflows CLI in a subprocess and create temp git repos for integration tests.
 * Integration tests use real `git`; run `bun test` with full permissions if your environment
 * restricts filesystem (e.g. .git/hooks creation). Unit tests do not require git.
 * @module tests/helpers
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dir, "..");
/** Use workspace-scoped temp dir so sandbox allows git ops. */
const TEST_TMP = join(PROJECT_ROOT, "tmp-test-repos");
const CLI_PATH = join(PROJECT_ROOT, "src", "cli.ts");

export interface RunGflowsResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the gflows CLI with the given args, operating on repo at repoDir (passed as -C repoDir).
 * Spawns from project root so Bun can resolve src/cli.ts. Stdin is not a TTY (pipe) so pickers are skipped.
 */
export async function runGflows(
  repoDir: string,
  args: string[],
  options?: { stdin?: string }
): Promise<RunGflowsResult> {
  const fullArgs = ["-C", repoDir, ...args];
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...fullArgs], {
    cwd: PROJECT_ROOT,
    stdin: options?.stdin !== undefined ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  if (options?.stdin !== undefined) {
    proc.stdin?.write(options.stdin);
    proc.stdin?.end();
  }
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/**
 * Creates a temporary directory and initializes a git repo with an initial commit and main branch.
 * Caller should clean up with rm(dir, { recursive: true }) or use a unique subdir and clean later.
 */
export async function createTempRepo(): Promise<string> {
  const dir = join(
    TEST_TMP,
    `gflows-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
  await mkdir(dir, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.local",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.local",
  };
  const p = Bun.spawn(["git", "init", "-b", "main"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  await p.exited;
  if (p.exitCode !== 0) {
    await rm(dir, { recursive: true }).catch(() => {});
    throw new Error("git init failed");
  }
  await writeFile(join(dir, "README"), "initial\n", "utf-8");
  const add = Bun.spawn(["git", "add", "README"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  await add.exited;
  const commit = Bun.spawn(["git", "commit", "-m", "initial"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  await commit.exited;
  if (commit.exitCode !== 0) {
    const stderr = await new Response(commit.stderr).text();
    await rm(dir, { recursive: true }).catch(() => {});
    throw new Error(`git commit failed: ${stderr}`);
  }
  return dir;
}
