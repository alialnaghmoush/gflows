import { describe, expect, test } from "bun:test";
import { completeSlashInput, filterSlashCommands } from "../src/tui/slash.js";

describe("filterSlashCommands", () => {
  test("shows all commands for bare /", () => {
    const matches = filterSlashCommands("/");
    expect(matches.length).toBeGreaterThan(5);
    expect(matches.some((m) => m.name === "start")).toBe(true);
  });

  test("filters by prefix", () => {
    const matches = filterSlashCommands("/st");
    const names = matches.map((m) => m.name);
    expect(names).toContain("start");
    expect(names).toContain("status");
    expect(names).not.toContain("finish");
  });

  test("stops suggesting after a completed command + args", () => {
    expect(filterSlashCommands("/start feature")).toEqual([]);
  });

  test("ignores non-slash input", () => {
    expect(filterSlashCommands("start")).toEqual([]);
  });
});

describe("completeSlashInput", () => {
  test("completes unique match with trailing space", () => {
    expect(completeSlashInput("/doct")).toBe("/doctor ");
  });

  test("completes selected match without trailing space when ambiguous", () => {
    const out = completeSlashInput("/st", 0);
    expect(out === "/start" || out === "/status" || out === "/switch").toBe(true);
    expect(out?.endsWith(" ")).toBe(false);
  });
});
