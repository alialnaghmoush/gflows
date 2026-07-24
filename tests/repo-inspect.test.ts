/**
 * Unit tests for repo layout / stack inspection (`gflows info`).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "../src/parse.ts";
import { collectInfoReport } from "../src/repo-inspect.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "gflows-info-"));
  dirs.push(d);
  return d;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

describe("parse info", () => {
  test("gflows info resolves", () => {
    const a = parse(["info"]);
    expect(a.command).toBe("info");
  });

  test("gflows info --json", () => {
    const a = parse(["info", "--json"]);
    expect(a.command).toBe("info");
    expect(a.json).toBe(true);
  });
});

describe("collectInfoReport", () => {
  test("monolith with React", async () => {
    const dir = tempDir();
    writeJson(join(dir, "package.json"), {
      name: "web-app",
      version: "1.2.3",
      dependencies: { react: "^19.0.0" },
    });
    const report = await collectInfoReport(dir);
    expect(report.layout).toBe("monolith");
    expect(report.version).toBe("1.2.3");
    expect(report.name).toBe("web-app");
    expect(report.stacks.frontend.map((s) => s.id)).toContain("react");
    expect(report.stacks.fullstack).toHaveLength(0);
  });

  test("monorepo via workspaces and nested packages", async () => {
    const dir = tempDir();
    writeJson(join(dir, "package.json"), {
      name: "root",
      version: "2.0.0",
      private: true,
      workspaces: ["apps/*", "packages/*"],
    });
    mkdirSync(join(dir, "apps", "web"), { recursive: true });
    mkdirSync(join(dir, "packages", "api"), { recursive: true });
    writeJson(join(dir, "apps", "web", "package.json"), {
      name: "@demo/web",
      version: "2.0.0",
      dependencies: { next: "^15.0.0", react: "^19.0.0" },
    });
    writeJson(join(dir, "packages", "api", "package.json"), {
      name: "@demo/api",
      version: "2.0.1",
      dependencies: { hono: "^4.0.0" },
    });
    const report = await collectInfoReport(dir);
    expect(report.layout).toBe("monorepo");
    expect(report.layoutReasons.some((r) => r.includes("workspaces"))).toBe(true);
    expect(report.version).toBe("2.0.0");
    expect(report.packages.length).toBeGreaterThanOrEqual(3);
    expect(report.stacks.fullstack.map((s) => s.id)).toContain("next");
    expect(report.stacks.frontend.map((s) => s.id)).toContain("react");
    expect(report.stacks.backend.map((s) => s.id)).toContain("hono");
  });

  test("Express-only backend", async () => {
    const dir = tempDir();
    writeJson(join(dir, "package.json"), {
      name: "api",
      version: "0.1.0",
      dependencies: { express: "^4.0.0" },
    });
    const report = await collectInfoReport(dir);
    expect(report.stacks.backend.map((s) => s.id)).toEqual(["express"]);
    expect(report.stacks.frontend).toHaveLength(0);
  });

  test("NestJS suppresses Express peer noise", async () => {
    const dir = tempDir();
    writeJson(join(dir, "package.json"), {
      name: "api",
      version: "0.1.0",
      dependencies: {
        "@nestjs/core": "^11.0.0",
        express: "^4.0.0",
      },
    });
    const report = await collectInfoReport(dir);
    expect(report.stacks.backend.map((s) => s.id)).toContain("nestjs");
    expect(report.stacks.backend.map((s) => s.id)).not.toContain("express");
  });

  test("no package.json but go.mod", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "go.mod"), "module example.com/demo\n\ngo 1.22\n", "utf-8");
    const report = await collectInfoReport(dir);
    expect(report.version).toBeNull();
    expect(report.packages).toHaveLength(0);
    expect(report.runtimes).toContain("Go");
    expect(report.layout).toBe("monolith");
  });
});
