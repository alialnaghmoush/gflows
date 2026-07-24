/**
 * Typed errors for gflows CLI. Each maps to an exit code:
 * - Validation/usage (InvalidVersionError, InvalidBranchNameError) → EXIT_USER (1)
 * - Git/repo/state (others) → EXIT_GIT (2)
 * @module errors
 */

import { EXIT_GIT, EXIT_USER } from "./constants.js";

/** Base error for gflows with a stable exit code. */
export class GflowsError extends Error {
  /** Exit code to use when this error is thrown (1 = user, 2 = git). */
  readonly exitCode: number;
  /** Optional remediation hint printed after the message. */
  readonly hint?: string;

  constructor(message: string, exitCode: number, hint?: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Thrown when cwd (or -C) is not a Git repository. */
export class NotRepoError extends GflowsError {
  constructor(
    message = "Not a Git repository.",
    hint = "Run from a directory that contains .git, or use -C <path> to point at the repo root.",
  ) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when a required branch does not exist (local or after fetch). */
export class BranchNotFoundError extends GflowsError {
  constructor(message: string, hint?: string) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when creating a branch that already exists. */
export class BranchExistsError extends GflowsError {
  constructor(message: string, hint?: string) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when start is run with uncommitted changes and without --force. */
export class DirtyWorkingTreeError extends GflowsError {
  constructor(
    message = "Working tree has uncommitted changes. Commit or stash them, or use --force.",
    hint = "--force creates/finishes anyway and keeps uncommitted changes in the working tree.",
  ) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when an operation requires a branch but HEAD is detached. */
export class DetachedHeadError extends GflowsError {
  constructor(
    message = "HEAD is detached. Checkout a branch first.",
    hint = "Try: git checkout dev  (or main)",
  ) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when a rebase or merge is in progress; user must complete or abort first. */
export class RebaseMergeInProgressError extends GflowsError {
  constructor(
    message = "A rebase or merge is in progress.",
    hint = "Resolve conflicts then run gflows continue, or gflows abort / gflows undo.",
  ) {
    super(message, EXIT_GIT, hint);
  }
}

/** Thrown when merge fails due to conflicts; user must resolve manually. */
export class MergeConflictError extends GflowsError {
  constructor(message: string, hint?: string) {
    super(
      message,
      EXIT_GIT,
      hint ?? "Resolve conflicts, then: gflows continue. Or: gflows abort / gflows undo.",
    );
  }
}

/** Thrown when release/hotfix version does not match expected format (vX.Y.Z or X.Y.Z). */
export class InvalidVersionError extends GflowsError {
  constructor(message: string) {
    super(message, EXIT_USER);
  }
}

/** Thrown when branch name is empty, whitespace, or contains invalid ref characters. */
export class InvalidBranchNameError extends GflowsError {
  constructor(message: string) {
    super(message, EXIT_USER);
  }
}

/** Thrown when delete is attempted on the configured main or dev branch. */
export class CannotDeleteMainOrDevError extends GflowsError {
  constructor(message = "Cannot delete the long-lived branch main or dev.") {
    super(message, EXIT_GIT);
  }
}

/** Thrown when finish has nothing to merge (0 commits ahead of target). */
export class NothingToFinishError extends GflowsError {
  constructor(message: string) {
    super(message, EXIT_GIT, "Commit your changes on the workflow branch, then finish again.");
  }
}

/**
 * Returns the exit code for an error: use error.exitCode if it's a GflowsError, else EXIT_GIT.
 */
export function exitCodeForError(error: unknown): number {
  if (error instanceof GflowsError) {
    return error.exitCode;
  }
  return EXIT_GIT;
}

/**
 * Prints a GflowsError (or Error) message and optional remediation hint to stderr.
 */
export function printError(error: unknown): void {
  if (error instanceof GflowsError) {
    console.error("gflows:", error.message);
    if (error.hint) {
      console.error(`Hint: ${error.hint}`);
    }
    return;
  }
  console.error("gflows:", error instanceof Error ? error.message : String(error));
}
