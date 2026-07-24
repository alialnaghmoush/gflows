/**
 * Unit tests for package.json script alias helper.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGflowsScriptAlias, isValidScriptAliasName } from "../src/package-scripts.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "gflows-alias-"));
  dirs.push(d);
  return d;
}

describe("isValidScriptAliasName", () => {
  test("accepts g and gflows", () => {
    expect(isValidScriptAliasName("g")).toBe(true);
    expect(isValidScriptAliasName("gflows")).toBe(true);
  });

  test("rejects empty and unsafe names", () => {
    expect(isValidScriptAliasName("")).toBe(false);
    expect(isValidScriptAliasName("g flows")).toBe(false);
    expect(isValidScriptAliasName("../x")).toBe(false);
  });
});

describe("ensureGflowsScriptAlias", () => {
  test("adds scripts.g when missing", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "demo" }, null, 2)}\n`);
    const result = ensureGflowsScriptAlias(dir, "g");
    expect(result.status).toBe("added");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.g).toBe("gflows");
  });

  test("unchanged when already gflows", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ scripts: { g: "gflows" } }, null, 2)}\n`,
    );
    expect(ensureGflowsScriptAlias(dir, "g").status).toBe("unchanged");
  });

  test("conflict when script points elsewhere", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ scripts: { g: "gulp" } }, null, 2)}\n`,
    );
    const result = ensureGflowsScriptAlias(dir, "g");
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.existing).toBe("gulp");
  });

  test("no-package when missing", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "sub"));
    expect(ensureGflowsScriptAlias(dir, "g").status).toBe("no-package");
  });
});
