/**
 * Unit tests for constants: exit codes, version regex, invalid branch chars.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DEV,
  DEFAULT_MAIN,
  DEFAULT_PREFIXES,
  DEFAULT_REMOTE,
  EXIT_GIT,
  EXIT_OK,
  EXIT_USER,
  INVALID_BRANCH_CHARS,
  VERSION_REGEX,
} from "../src/constants.ts";

describe("constants", () => {
  test("EXIT_OK is 0", () => {
    expect(EXIT_OK).toBe(0);
  });
  test("EXIT_USER is 1", () => {
    expect(EXIT_USER).toBe(1);
  });
  test("EXIT_GIT is 2", () => {
    expect(EXIT_GIT).toBe(2);
  });
  test("DEFAULT_MAIN is main", () => {
    expect(DEFAULT_MAIN).toBe("main");
  });
  test("DEFAULT_DEV is dev", () => {
    expect(DEFAULT_DEV).toBe("dev");
  });
  test("DEFAULT_REMOTE is origin", () => {
    expect(DEFAULT_REMOTE).toBe("origin");
  });
  test("DEFAULT_PREFIXES has all types with trailing slash", () => {
    expect(DEFAULT_PREFIXES.feature).toBe("feature/");
    expect(DEFAULT_PREFIXES.bugfix).toBe("bugfix/");
    expect(DEFAULT_PREFIXES.chore).toBe("chore/");
    expect(DEFAULT_PREFIXES.release).toBe("release/");
    expect(DEFAULT_PREFIXES.hotfix).toBe("hotfix/");
    expect(DEFAULT_PREFIXES.spike).toBe("spike/");
  });
});

describe("VERSION_REGEX", () => {
  test("accepts vX.Y.Z", () => {
    expect(VERSION_REGEX.test("v1.0.0")).toBe(true);
    expect(VERSION_REGEX.test("v0.1.2")).toBe(true);
    expect(VERSION_REGEX.test("v10.20.30")).toBe(true);
  });
  test("accepts X.Y.Z without v", () => {
    expect(VERSION_REGEX.test("1.0.0")).toBe(true);
    expect(VERSION_REGEX.test("0.1.2")).toBe(true);
  });
  test("rejects invalid versions", () => {
    expect(VERSION_REGEX.test("1.0")).toBe(false);
    expect(VERSION_REGEX.test("1.0.0.0")).toBe(false);
    expect(VERSION_REGEX.test("v1.0")).toBe(false);
    expect(VERSION_REGEX.test("1.0.0-beta")).toBe(false);
    expect(VERSION_REGEX.test("")).toBe(false);
    expect(VERSION_REGEX.test("v")).toBe(false);
    expect(VERSION_REGEX.test("abc")).toBe(false);
  });
});

describe("INVALID_BRANCH_CHARS", () => {
  test("matches invalid ref characters", () => {
    expect(INVALID_BRANCH_CHARS.test("a..b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a~b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a^b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a?b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a*b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a[b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a:b")).toBe(true);
    expect(INVALID_BRANCH_CHARS.test("a\\b")).toBe(true);
  });
  test("does not match valid branch name chars", () => {
    expect(INVALID_BRANCH_CHARS.test("feature-my-branch")).toBe(false);
    expect(INVALID_BRANCH_CHARS.test("abc123")).toBe(false);
  });
});
