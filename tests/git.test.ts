/**
 * Unit tests for git helpers: validateBranchName.
 */

import { describe, expect, test } from "bun:test";
import { validateBranchName } from "../src/git.ts";
import { InvalidBranchNameError } from "../src/errors.ts";

describe("validateBranchName", () => {
  test("accepts valid names", () => {
    expect(() => validateBranchName("my-feat")).not.toThrow();
    expect(() => validateBranchName("abc123")).not.toThrow();
    expect(() => validateBranchName("fix-issue-42")).not.toThrow();
  });

  test("throws InvalidBranchNameError for empty string", () => {
    expect(() => validateBranchName("")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("")).toThrow("empty");
  });

  test("throws InvalidBranchNameError for whitespace-only", () => {
    expect(() => validateBranchName("   ")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("\t")).toThrow(InvalidBranchNameError);
  });

  test("throws InvalidBranchNameError for invalid ref characters", () => {
    expect(() => validateBranchName("a..b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a~b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a^b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a?b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a*b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a[b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a:b")).toThrow(InvalidBranchNameError);
    expect(() => validateBranchName("a\\b")).toThrow(InvalidBranchNameError);
  });
});
