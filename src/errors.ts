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

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    this.exitCode = exitCode;
  }
}

/** Thrown when cwd (or -C) is not a Git repository. */
export class NotRepoError extends GflowsError {
  constructor(message = "Not a Git repository.") {
    super(message, EXIT_GIT);
  }
}

/** Thrown when a required branch does not exist (local or after fetch). */
export class BranchNotFoundError extends GflowsError {
  constructor(message: string) {
    super(message, EXIT_GIT);
  }
}

/** Thrown when start is run with uncommitted changes and without --force. */
export class DirtyWorkingTreeError extends GflowsError {
  constructor(
    message = "Working tree has uncommitted changes. Commit or stash them, or use --force.",
  ) {
    super(message, EXIT_GIT);
  }
}

/** Thrown when an operation requires a branch but HEAD is detached. */
export class DetachedHeadError extends GflowsError {
  constructor(message = "HEAD is detached. Checkout a branch first.") {
    super(message, EXIT_GIT);
  }
}

/** Thrown when a rebase or merge is in progress; user must complete or abort first. */
export class RebaseMergeInProgressError extends GflowsError {
  constructor(
    message = "A rebase or merge is in progress. Complete or abort it before running this command.",
  ) {
    super(message, EXIT_GIT);
  }
}

/** Thrown when merge fails due to conflicts; user must resolve manually. */
export class MergeConflictError extends GflowsError {
  constructor(message: string) {
    super(message, EXIT_GIT);
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

/**
 * Returns the exit code for an error: use error.exitCode if it's a GflowsError, else EXIT_GIT.
 */
export function exitCodeForError(error: unknown): number {
  if (error instanceof GflowsError) {
    return error.exitCode;
  }
  return EXIT_GIT;
}
