/**
 * Unit tests for typed errors and exitCodeForError.
 */

import { describe, expect, test } from "bun:test";
import {
  GflowsError,
  NotRepoError,
  BranchNotFoundError,
  DirtyWorkingTreeError,
  DetachedHeadError,
  RebaseMergeInProgressError,
  MergeConflictError,
  InvalidVersionError,
  InvalidBranchNameError,
  CannotDeleteMainOrDevError,
  exitCodeForError,
} from "../src/errors.ts";
import { EXIT_USER, EXIT_GIT } from "../src/constants.ts";

describe("GflowsError", () => {
  test("sets message and exitCode", () => {
    const err = new GflowsError("test", EXIT_USER);
    expect(err.message).toBe("test");
    expect(err.exitCode).toBe(EXIT_USER);
    expect(err.name).toBe("GflowsError");
  });
});

describe("NotRepoError", () => {
  test("default message and EXIT_GIT", () => {
    const err = new NotRepoError();
    expect(err.message).toBe("Not a Git repository.");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
  test("custom message", () => {
    const err = new NotRepoError("custom");
    expect(err.message).toBe("custom");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("BranchNotFoundError", () => {
  test("uses message and EXIT_GIT", () => {
    const err = new BranchNotFoundError("Branch 'x' not found.");
    expect(err.message).toBe("Branch 'x' not found.");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("DirtyWorkingTreeError", () => {
  test("default message and EXIT_GIT", () => {
    const err = new DirtyWorkingTreeError();
    expect(err.message).toContain("uncommitted");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("DetachedHeadError", () => {
  test("default message and EXIT_GIT", () => {
    const err = new DetachedHeadError();
    expect(err.message).toContain("detached");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("RebaseMergeInProgressError", () => {
  test("default message and EXIT_GIT", () => {
    const err = new RebaseMergeInProgressError();
    expect(err.message).toContain("rebase");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("MergeConflictError", () => {
  test("uses message and EXIT_GIT", () => {
    const err = new MergeConflictError("Conflict merging feature/x.");
    expect(err.message).toContain("Conflict");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("InvalidVersionError", () => {
  test("uses message and EXIT_USER", () => {
    const err = new InvalidVersionError("Invalid version 'x'.");
    expect(err.message).toBe("Invalid version 'x'.");
    expect(err.exitCode).toBe(EXIT_USER);
  });
});

describe("InvalidBranchNameError", () => {
  test("uses message and EXIT_USER", () => {
    const err = new InvalidBranchNameError("Branch name cannot be empty.");
    expect(err.message).toBe("Branch name cannot be empty.");
    expect(err.exitCode).toBe(EXIT_USER);
  });
});

describe("CannotDeleteMainOrDevError", () => {
  test("default message and EXIT_GIT", () => {
    const err = new CannotDeleteMainOrDevError();
    expect(err.message).toContain("main");
    expect(err.exitCode).toBe(EXIT_GIT);
  });
});

describe("exitCodeForError", () => {
  test("returns error.exitCode for GflowsError", () => {
    expect(exitCodeForError(new NotRepoError())).toBe(EXIT_GIT);
    expect(exitCodeForError(new InvalidVersionError("x"))).toBe(EXIT_USER);
  });
  test("returns EXIT_GIT for non-GflowsError", () => {
    expect(exitCodeForError(new Error("generic"))).toBe(EXIT_GIT);
    expect(exitCodeForError("string")).toBe(EXIT_GIT);
    expect(exitCodeForError(null)).toBe(EXIT_GIT);
  });
});
