/**
 * Unit tests for viz / recommend helpers (no git required).
 */

import { describe, expect, test } from "bun:test";
import { recommend } from "../src/recommend.ts";
import {
  renderBranchMap,
  renderFlowLegend,
  renderLifecycle,
  renderVizPanel,
  renderYouAreHere,
  type VizSnapshot,
} from "../src/viz.ts";

const snap: VizSnapshot = {
  main: "main",
  dev: "dev",
  current: "feature/login",
  suspended: null,
  needsInit: false,
  rows: [
    {
      name: "main",
      type: "main",
      current: false,
      ahead: 0,
      behind: 0,
      base: "—",
      mergeTargetDisplay: "production",
    },
    {
      name: "dev",
      type: "dev",
      current: false,
      ahead: 0,
      behind: 0,
      base: "—",
      mergeTargetDisplay: "integration",
    },
    {
      name: "feature/login",
      type: "feature",
      current: true,
      ahead: 2,
      behind: 0,
      base: "dev",
      mergeTargetDisplay: "dev",
    },
  ],
};

describe("viz render", () => {
  test("flow legend mentions main and dev", () => {
    const lines = renderFlowLegend({ main: "main", dev: "dev" });
    expect(lines.join("\n")).toContain("main");
    expect(lines.join("\n")).toContain("dev");
  });

  test("branch map highlights current workflow branch", () => {
    const text = renderBranchMap(snap).join("\n");
    expect(text).toContain("feature/login");
    expect(text).toContain("Branches");
  });

  test("you are here suggests finish when ahead", () => {
    const text = renderYouAreHere(snap).join("\n");
    expect(text).toMatch(/finish|pr/i);
  });

  test("full panel includes status chrome and lifecycle", () => {
    const text = renderVizPanel(snap).join("\n");
    expect(text).toContain("gflows");
    expect(text).toContain("Lifecycle");
    expect(text).toContain("Status");
  });

  test("lifecycle strip is present", () => {
    const text = renderLifecycle(snap).join("\n");
    expect(text).toContain("init");
    expect(text).toContain("finish");
  });
});

describe("recommend", () => {
  test("ahead of base → finish", () => {
    expect(recommend(snap).action).toBe("finish");
  });

  test("needsInit → init", () => {
    expect(recommend({ ...snap, needsInit: true }).action).toBe("init");
  });

  test("behind → sync", () => {
    const behind: VizSnapshot = {
      ...snap,
      rows: snap.rows.map((r) => (r.name === "feature/login" ? { ...r, ahead: 1, behind: 3 } : r)),
    };
    expect(recommend(behind).action).toBe("sync");
  });

  test("on dev → start", () => {
    const onDev: VizSnapshot = {
      ...snap,
      current: "dev",
      rows: snap.rows.map((r) => ({
        ...r,
        current: r.name === "dev",
      })),
    };
    expect(recommend(onDev).action).toBe("start");
  });
});
