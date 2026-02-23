/**
 * Unit tests for config: readConfigFile, resolveConfig, getPrefixForType, getBranchTypeMeta.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getBranchTypeMeta,
  getPrefixForType,
  readConfigFile,
  resolveConfig,
  writeConfigFile,
} from "../src/config.ts";
import { DEFAULT_DEV, DEFAULT_MAIN, DEFAULT_PREFIXES, DEFAULT_REMOTE } from "../src/constants.ts";

describe("readConfigFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `gflows-config-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true }).catch(() => {});
  });

  test("returns null when no config file exists", () => {
    const result = readConfigFile(dir);
    expect(result.config).toBeNull();
    expect(result.invalid).toBe(false);
  });

  test("reads .gflows.json when present", async () => {
    await writeFile(
      join(dir, ".gflows.json"),
      JSON.stringify({ main: "master", dev: "develop" }),
      "utf-8",
    );
    const result = readConfigFile(dir);
    expect(result.config).not.toBeNull();
    expect(result.config?.main).toBe("master");
    expect(result.config?.dev).toBe("develop");
    expect(result.invalid).toBe(false);
  });

  test("reads package.json gflows key when present", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "pkg", gflows: { main: "trunk", remote: "upstream" } }),
      "utf-8",
    );
    const result = readConfigFile(dir);
    expect(result.config).not.toBeNull();
    expect(result.config?.main).toBe("trunk");
    expect(result.config?.remote).toBe("upstream");
    expect(result.invalid).toBe(false);
  });

  test("returns invalid true for malformed .gflows.json", async () => {
    await writeFile(join(dir, ".gflows.json"), "{ invalid json", "utf-8");
    const result = readConfigFile(dir);
    expect(result.config).toBeNull();
    expect(result.invalid).toBe(true);
  });

  test("normalizes prefixes from config", async () => {
    await writeFile(
      join(dir, ".gflows.json"),
      JSON.stringify({ prefixes: { feature: "feat/", bugfix: "fix/" } }),
      "utf-8",
    );
    const result = readConfigFile(dir);
    expect(result.config?.prefixes?.feature).toBe("feat/");
    expect(result.config?.prefixes?.bugfix).toBe("fix/");
  });
});

describe("resolveConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `gflows-resolve-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true }).catch(() => {});
  });

  test("returns defaults when no file", () => {
    const config = resolveConfig(dir);
    expect(config.main).toBe(DEFAULT_MAIN);
    expect(config.dev).toBe(DEFAULT_DEV);
    expect(config.remote).toBe(DEFAULT_REMOTE);
    expect(config.prefixes.feature).toBe(DEFAULT_PREFIXES.feature);
  });

  test("CLI overrides take precedence", () => {
    const config = resolveConfig(dir, { main: "trunk", dev: "work", remote: "origin2" });
    expect(config.main).toBe("trunk");
    expect(config.dev).toBe("work");
    expect(config.remote).toBe("origin2");
  });
});

describe("writeConfigFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `gflows-write-config-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true }).catch(() => {});
  });

  test("creates .gflows.json with main, dev, remote when none exists", () => {
    writeConfigFile(dir, { main: "master", dev: "develop", remote: "upstream" });
    const result = readConfigFile(dir);
    expect(result.config?.main).toBe("master");
    expect(result.config?.dev).toBe("develop");
    expect(result.config?.remote).toBe("upstream");
  });

  test("merges with existing .gflows.json when only some keys provided", async () => {
    await writeFile(
      join(dir, ".gflows.json"),
      JSON.stringify({ main: "main", dev: "dev", remote: "origin" }),
      "utf-8",
    );
    writeConfigFile(dir, { dev: "develop" });
    const result = readConfigFile(dir);
    expect(result.config?.main).toBe("main");
    expect(result.config?.dev).toBe("develop");
    expect(result.config?.remote).toBe("origin");
  });

  test("skips empty string values", () => {
    writeConfigFile(dir, { main: "main", dev: "", remote: "origin" });
    const result = readConfigFile(dir);
    expect(result.config?.main).toBe("main");
    expect(result.config?.dev).toBeUndefined();
    expect(result.config?.remote).toBe("origin");
  });
});

describe("getPrefixForType", () => {
  test("returns default prefix for each type", () => {
    const config = resolveConfig("/nonexistent");
    expect(getPrefixForType(config, "feature")).toBe("feature/");
    expect(getPrefixForType(config, "release")).toBe("release/");
    expect(getPrefixForType(config, "hotfix")).toBe("hotfix/");
  });
});

describe("getBranchTypeMeta", () => {
  test("feature: base dev, merge dev, no tag", () => {
    const meta = getBranchTypeMeta("feature");
    expect(meta.base).toBe("dev");
    expect(meta.mergeTarget).toBe("dev");
    expect(meta.tagOnFinish).toBe(false);
  });

  test("bugfix: base dev, merge dev, no tag", () => {
    const meta = getBranchTypeMeta("bugfix");
    expect(meta.base).toBe("dev");
    expect(meta.mergeTarget).toBe("dev");
    expect(meta.tagOnFinish).toBe(false);
  });

  test("chore: base dev, merge dev, no tag", () => {
    const meta = getBranchTypeMeta("chore");
    expect(meta.base).toBe("dev");
    expect(meta.mergeTarget).toBe("dev");
    expect(meta.tagOnFinish).toBe(false);
  });

  test("release: base dev, merge main-then-dev, tag", () => {
    const meta = getBranchTypeMeta("release");
    expect(meta.base).toBe("dev");
    expect(meta.mergeTarget).toBe("main-then-dev");
    expect(meta.tagOnFinish).toBe(true);
  });

  test("hotfix: base main, merge main-then-dev, tag", () => {
    const meta = getBranchTypeMeta("hotfix");
    expect(meta.base).toBe("main");
    expect(meta.mergeTarget).toBe("main-then-dev");
    expect(meta.tagOnFinish).toBe(true);
  });

  test("spike: base dev, merge dev, no tag", () => {
    const meta = getBranchTypeMeta("spike");
    expect(meta.base).toBe("dev");
    expect(meta.mergeTarget).toBe("dev");
    expect(meta.tagOnFinish).toBe(false);
  });
});
