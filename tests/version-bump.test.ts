/**
 * Unit tests for format-preserving package version updates.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeBump, replaceVersionInJsonText, writePackageVersion } from "../src/version-bump.ts";

describe("version-bump format preservation", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("replaceVersionInJsonText keeps tabs and surrounding text", () => {
    const raw = `{\n\t"name": "app",\n\t"version": "1.0.0",\n\t"private": true\n}\n`;
    const updated = replaceVersionInJsonText(raw, "1.0.1");
    expect(updated).toContain('\t"version": "1.0.1"');
    expect(updated).toContain('\t"name": "app"');
    expect(updated.includes("  ")).toBe(false);
  });

  test("writePackageVersion preserves tab indentation", () => {
    dir = mkdtempSync(join(tmpdir(), "gflows-vb-"));
    const pkg = `{\n\t"name": "demo",\n\t"version": "0.1.0"\n}\n`;
    writeFileSync(join(dir, "package.json"), pkg, "utf-8");
    writePackageVersion(dir, "0.1.1");
    const out = readFileSync(join(dir, "package.json"), "utf-8");
    expect(out).toBe(`{\n\t"name": "demo",\n\t"version": "0.1.1"\n}\n`);
  });

  test("computeBump up patch", () => {
    dir = mkdtempSync(join(tmpdir(), "gflows-vb-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", version: "1.2.3" }, null, 2),
      "utf-8",
    );
    const r = computeBump(dir, "up", "patch");
    expect(r.oldVersion).toBe("1.2.3");
    expect(r.newVersion).toBe("1.2.4");
  });

  test("replaceVersionInJsonText throws when version field missing", () => {
    expect(() => replaceVersionInJsonText('{ "name": "x" }', "1.0.0")).toThrow(/version/i);
  });

  test("nested package roots are discovered", () => {
    dir = mkdtempSync(join(tmpdir(), "gflows-vb-"));
    writeFileSync(join(dir, "package.json"), '{\n\t"version": "1.0.0"\n}\n', "utf-8");
    mkdirSync(join(dir, "packages", "a"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "a", "package.json"),
      '{\n\t"version": "1.0.0"\n}\n',
      "utf-8",
    );
    const r = computeBump(dir, "up", "minor");
    expect(r.newVersion).toBe("1.1.0");
    expect(r.roots.length).toBe(2);
  });
});
