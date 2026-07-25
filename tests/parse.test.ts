/**
 * Unit tests for CLI flag parsing — every documented long flag must bind.
 */

import { describe, expect, test } from "bun:test";
import { parse } from "../src/parse.ts";

describe("parse kebab-case flags", () => {
  test("--dry-run binds", () => {
    const a = parse(["status", "--dry-run"]);
    expect(a.dryRun).toBe(true);
  });

  test("-d binds dryRun", () => {
    const a = parse(["status", "-d"]);
    expect(a.dryRun).toBe(true);
  });

  test("--no-ff binds", () => {
    const a = parse(["finish", "--no-ff", "-P", "-y"]);
    expect(a.noFf).toBe(true);
  });

  test("--no-delete binds", () => {
    const a = parse(["finish", "--no-delete", "-P", "-y"]);
    expect(a.noDeleteAfterFinish).toBe(true);
  });

  test("--delete binds deleteAfterFinish", () => {
    const a = parse(["finish", "--delete", "-P", "-y"]);
    expect(a.deleteAfterFinish).toBe(true);
  });

  test("-D binds deleteAfterFinish", () => {
    const a = parse(["finish", "-D", "-P", "-y"]);
    expect(a.deleteAfterFinish).toBe(true);
  });

  test("--tag-message binds", () => {
    const a = parse(["finish", "--tag-message", "hi", "-P", "-y"]);
    expect(a.tagMessage).toBe("hi");
  });

  test("--no-tag binds", () => {
    const a = parse(["finish", "--no-tag", "-P", "-y"]);
    expect(a.noTag).toBe(true);
  });

  test("--no-push binds", () => {
    const a = parse(["start", "feature", "x", "--no-push"]);
    expect(a.noPush).toBe(true);
  });

  test("--include-remote binds on list", () => {
    const a = parse(["list", "--include-remote"]);
    expect(a.includeRemote).toBe(true);
  });

  test("--message binds", () => {
    const a = parse(["finish", "--message", "merge msg", "-P", "-y"]);
    expect(a.message).toBe("merge msg");
  });

  test("-L is delete command", () => {
    const a = parse(["-L", "feature/x"]);
    expect(a.command).toBe("delete");
  });

  test("new commands parse", () => {
    expect(parse(["sync"]).command).toBe("sync");
    expect(parse(["pr"]).command).toBe("pr");
    expect(parse(["doctor"]).command).toBe("doctor");
    expect(parse(["info"]).command).toBe("info");
    expect(parse(["viz"]).command).toBe("viz");
    expect(parse(["init", "--script-alias", "g"]).scriptAlias).toBe("g");
    expect(parse(["init", "--no-script-alias"]).noScriptAlias).toBe(true);
    expect(parse(["-U", "up", "minor"]).command).toBe("bump");
    expect(parse(["-U", "up", "minor"]).bumpDirection).toBe("up");
    expect(parse(["-U", "up", "minor"]).bumpType).toBe("minor");
    expect(parse(["bump", "down", "patch"]).bumpDirection).toBe("down");
    expect(parse(["release", "up", "patch"]).command).toBe("release");
    expect(parse(["release", "up", "patch"]).bumpDirection).toBe("up");
    expect(parse(["release", "up", "patch"]).bumpType).toBe("patch");
    expect(parse(["release", "up", "patch"]).keepCurrent).toBe(false);
    expect(parse(["release", "current"]).keepCurrent).toBe(true);
    expect(parse(["release", "current"]).bumpType).toBeUndefined();
    // finish --bump stays finish (not the bump command)
    expect(parse(["finish", "--bump", "-y", "-P"]).command).toBe("finish");
    expect(parse(["finish", "--bump", "-y", "-P"]).bumpOnFinish).toBe(true);
    expect(parse(["schema"]).command).toBe("schema");
    expect(parse(["continue"]).command).toBe("continue");
    expect(parse(["undo"]).command).toBe("undo");
    expect(parse(["abort"]).command).toBe("abort");
    expect(parse(["config", "get", "main"]).configAction).toBe("get");
    expect(parse(["config", "get", "main"]).configKey).toBe("main");
  });

  test("--json --rebase --squash --preview --bump", () => {
    const a = parse(["finish", "--squash", "--preview", "--bump", "-P", "-y"]);
    expect(a.squash).toBe(true);
    expect(a.preview).toBe(true);
    expect(a.bumpOnFinish).toBe(true);
    const s = parse(["sync", "--rebase"]);
    expect(s.rebase).toBe(true);
    const st = parse(["status", "--json"]);
    expect(st.json).toBe(true);
  });
});
