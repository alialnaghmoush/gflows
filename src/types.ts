/**
 * Core types for the gflows CLI: branch types, parsed arguments, and config.
 * @module types
 */

/** Supported workflow branch types (core + optional spike). */
export type BranchType = "feature" | "bugfix" | "chore" | "release" | "hotfix" | "spike";

/** Short flag for each branch type when used as CLI type selector. */
export const BRANCH_TYPE_SHORTS: Record<BranchType, string> = {
  feature: "f",
  bugfix: "b",
  chore: "c",
  release: "r",
  hotfix: "x",
  spike: "e",
} as const;

/** Default base branch for each type (without -o main override). */
export type BranchTypeBase = "main" | "dev";

/** Merge target(s) for each branch type on finish. */
export type MergeTarget = "main" | "dev" | "main-then-dev";

/** CLI command names. */
export type Command =
  | "init"
  | "start"
  | "finish"
  | "switch"
  | "delete"
  | "list"
  | "bump"
  | "completion"
  | "status"
  | "help"
  | "version";

/** Branch prefix overrides per type (e.g. "feature" -> "feature/"). */
export interface BranchPrefixes {
  feature?: string;
  bugfix?: string;
  chore?: string;
  release?: string;
  hotfix?: string;
  spike?: string;
}

/** Repo config file shape (.gflows.json or package.json "gflows" key). */
export interface GflowsConfigFile {
  main?: string;
  dev?: string;
  remote?: string;
  prefixes?: BranchPrefixes;
}

/** Resolved config used by commands (all required, with defaults applied). */
export interface ResolvedConfig {
  main: string;
  dev: string;
  remote: string;
  prefixes: Required<BranchPrefixes>;
}

/** Metadata for a branch type: base, merge target(s), whether to tag on finish. */
export interface BranchTypeMeta {
  base: BranchTypeBase;
  mergeTarget: MergeTarget;
  tagOnFinish: boolean;
}

/** Bump direction for version command. */
export type BumpDirection = "up" | "down";

/** Bump type (semver segment). */
export type BumpType = "patch" | "minor" | "major";

/** Parsed CLI arguments after resolving command, type, name, and flags. */
export interface ParsedArgs {
  command: Command;
  /** Resolved repo path (absolute); from -C/--path or cwd. */
  cwd: string;
  /** Branch type (for start, finish, list). */
  type?: BranchType;
  /** Branch or version name (for start: branch name or e.g. v1.2.0 for release/hotfix). */
  name?: string;
  /** Completion shell (bash | zsh | fish). */
  completionShell?: "bash" | "zsh" | "fish";
  /** For delete: branch name(s) as positionals. */
  branchNames?: string[];
  /** Bump direction (up | down). */
  bumpDirection?: BumpDirection;
  /** Bump type (patch | minor | major). */
  bumpType?: BumpType;
  // Common flags
  push: boolean;
  noPush: boolean;
  /** Main branch override (e.g. from --main; init persists to .gflows.json). */
  main: string | undefined;
  /** Dev branch override (e.g. from --dev; init persists to .gflows.json). */
  dev: string | undefined;
  remote: string | undefined;
  branch: string | undefined;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  force: boolean;
  path: string | undefined;
  // start
  fromMain: boolean;
  // finish
  noFf: boolean;
  deleteAfterFinish: boolean;
  noDeleteAfterFinish: boolean;
  signTag: boolean;
  noTag: boolean;
  tagMessage: string | undefined;
  message: string | undefined;
  // list
  includeRemote: boolean;
}
