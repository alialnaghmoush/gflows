/**
 * Exit codes and default branch names/prefixes for gflows.
 * @module constants
 */

/** Exit code: success. */
export const EXIT_OK = 0;

/** Exit code: usage/validation error (missing args, invalid type, invalid branch name/version). */
export const EXIT_USER = 1;

/** Exit code: Git or system error (not a repo, branch missing, merge failed, tag exists, etc.). */
export const EXIT_GIT = 2;

/** Default long-lived main branch name. */
export const DEFAULT_MAIN = "main";

/** Default long-lived development branch name. */
export const DEFAULT_DEV = "dev";

/** Default remote name. */
export const DEFAULT_REMOTE = "origin";

/** Default branch prefix per type (trailing slash for consistency). */
export const DEFAULT_PREFIXES = {
  feature: "feature/",
  bugfix: "bugfix/",
  chore: "chore/",
  release: "release/",
  hotfix: "hotfix/",
  spike: "spike/",
} as const;

/** Semver version pattern: optional leading 'v', then X.Y.Z. */
export const VERSION_REGEX = /^v?\d+\.\d+\.\d+$/;

/** Characters invalid in Git ref names (branch names). */
export const INVALID_BRANCH_CHARS = /\.\.|[\s~^?:*\[\]\\]/;
