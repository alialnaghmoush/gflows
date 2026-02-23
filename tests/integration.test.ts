/**
 * Integration tests: run gflows CLI in subprocess against temp git repos.
 * Covers happy path (init, start, finish), error paths (not a repo, dirty tree, finish on main, tag exists, merge conflict), and non-TTY behavior.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runGflows, createTempRepo } from "./helpers.ts";

describe("integration: init and start/finish cycle", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("init creates dev from main", async () => {
    dir = await createTempRepo();
    const r = await runGflows(dir, ["init"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("created branch 'dev'");

    const list = Bun.spawn(["git", "branch", "--list"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(list.stdout).text();
    await list.exited;
    expect(out).toContain("main");
    expect(out).toContain("dev");
  });

  test("start feature and finish merges into dev", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    let r = await runGflows(dir, ["start", "feature", "my-feat"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("feature/my-feat");

    await writeFile(join(dir, "foo"), "hello", "utf-8");
    const add = Bun.spawn(["git", "add", "foo"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    await add.exited;
    const commit = Bun.spawn(["git", "commit", "-m", "add foo"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await commit.exited;
    expect(commit.exitCode).toBe(0);

    r = await runGflows(dir, ["finish", "feature", "-y"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("finished");

    const branch = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const branchOut = await new Response(branch.stdout).text();
    await branch.exited;
    expect(branchOut.trim()).toBe("dev");
  });
});

describe("integration: error paths", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("not a git repo → exit 2 and message", async () => {
    dir = join(tmpdir(), `gflows-not-repo-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const r = await runGflows(dir, ["init"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/not a git repository/i);
  });

  test("start with dirty tree (no --force) → exit 2", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await writeFile(join(dir, "dirty"), "x", "utf-8");
    const r = await runGflows(dir, ["start", "feature", "x"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/uncommitted|working tree/i);
  });

  test("start with invalid version → exit 1", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["start", "release", "invalid"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/invalid version|vX\.Y\.Z/i);
  });

  test("finish on main → exit 2", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["finish", "-B", "main"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/long-lived|cannot finish/i);
  });

  test("finish on dev → exit 2", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["finish", "-B", "dev"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/long-lived|cannot finish/i);
  });

  test("delete main → exit 2", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["delete", "main"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/cannot delete|long-lived/i);
  });

  test("tag already exists on finish release → exit 2", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await runGflows(dir, ["start", "release", "v1.0.0"]);
    await runGflows(dir, ["finish", "release", "-y", "-T"]);
    const tag = Bun.spawn(["git", "tag", "v1.0.0"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    await tag.exited;
    if (tag.exitCode !== 0) {
      await Bun.spawn(["git", "checkout", "main"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).exited;
      await Bun.spawn(["git", "tag", "v1.0.0"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).exited;
    }
    await runGflows(dir, ["start", "release", "v1.0.0"]);
    const r = await runGflows(dir, ["finish", "release", "-B", "release/v1.0.0", "-y"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/tag.*already exists/i);
  });

  test("merge conflict on finish → exit 2 and conflict message", async () => {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@test.local",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@test.local",
    };
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await runGflows(dir, ["start", "feature", "conflict-feat"]);
    await writeFile(join(dir, "file"), "on-feature", "utf-8");
    await Bun.spawn(["git", "add", "file"], { cwd: dir, stdout: "pipe", stderr: "pipe", env: gitEnv }).exited;
    await Bun.spawn(["git", "commit", "-m", "feature change"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: gitEnv,
    }).exited;

    await runGflows(dir, ["switch", "dev"]);
    await writeFile(join(dir, "file"), "on-dev", "utf-8");
    await Bun.spawn(["git", "add", "file"], { cwd: dir, stdout: "pipe", stderr: "pipe", env: gitEnv }).exited;
    await Bun.spawn(["git", "commit", "-m", "dev change"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: gitEnv,
    }).exited;

    await runGflows(dir, ["switch", "feature/conflict-feat"]);
    const r = await runGflows(dir, ["finish", "feature", "-y"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/merge conflict|resolve conflicts/i);
  });
});

describe("integration: non-TTY behavior", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("start without type/name (non-TTY) → exit 1", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["start"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/requires type and name|usage/i);
  });
});

describe("integration: completion", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("completion without shell → exit 1 and usage message", async () => {
    dir = join(tmpdir(), `gflows-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const r = await runGflows(dir, ["completion"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/completion requires a shell|bash.*zsh.*fish/i);
  });

  test("completion bash prints script with commands and complete", async () => {
    dir = join(tmpdir(), `gflows-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const r = await runGflows(dir, ["completion", "bash"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# Bash completion");
    expect(r.stdout).toContain("complete -F _gflows");
    expect(r.stdout).toContain("init start finish switch delete list bump completion status help version");
  });

  test("completion zsh prints script with _gflows_list_branches", async () => {
    dir = join(tmpdir(), `gflows-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const r = await runGflows(dir, ["completion", "zsh"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# Zsh completion");
    expect(r.stdout).toContain("_gflows_list_branches");
  });

  test("completion fish prints script with __gflows_list_branches", async () => {
    dir = join(tmpdir(), `gflows-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const r = await runGflows(dir, ["completion", "fish"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# Fish completion");
    expect(r.stdout).toContain("__gflows_list_branches");
  });
});

describe("integration: list and status", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("list shows workflow branches", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await runGflows(dir, ["start", "feature", "listed"]);
    const r = await runGflows(dir, ["list"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("feature/listed");
  });

  test("status on feature branch shows type and target", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await runGflows(dir, ["start", "feature", "st"]);
    const r = await runGflows(dir, ["status"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/feature|dev/);
  });

  test("list with -r/--include-remote exits 0 and shows local branches", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    await runGflows(dir, ["start", "feature", "local-only"]);
    const r = await runGflows(dir, ["list", "-r"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("feature/local-only");
  });
});

describe("integration: empty branch list and non-TTY", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true }).catch(() => {});
  });

  test("switch with no branch name (non-TTY) → exit 1 and message", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["switch"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/no branch name|not a TTY|Pass a branch name/i);
  });

  test("delete with no branch names (non-TTY) → exit 1 and message", async () => {
    dir = await createTempRepo();
    await runGflows(dir, ["init"]);
    const r = await runGflows(dir, ["delete"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/no branch name|not a TTY|Pass branch name/i);
  });
});
