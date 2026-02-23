/**
 * Library entry for gflows. Re-exports types, config, git helpers, and errors
 * for programmatic use. The CLI is invoked via the `gflows` binary (see package.json bin).
 * @module
 */

export type {
  BranchType,
  BranchTypeBase,
  BranchPrefixes,
  BumpDirection,
  BumpType,
  Command,
  GflowsConfigFile,
  MergeTarget,
  ParsedArgs,
  ResolvedConfig,
  BranchTypeMeta,
} from "./types.js";
export { BRANCH_TYPE_SHORTS } from "./types.js";

export {
  readConfigFile,
  resolveConfig,
  getPrefixForType,
  getBranchTypeMeta,
  getEnvConfigOverrides,
} from "./config.js";
export type {
  ConfigCliOverrides,
  ReadConfigResult,
  ResolveConfigOptions,
} from "./config.js";

export {
  runGit,
  resolveRepoRoot,
  ensureGitRepo,
  revParse,
  branchList,
  checkout,
  merge,
  push,
  tag,
  tagExists,
  deleteBranch,
  isClean,
  getCurrentBranch,
  isDetachedHead,
  isRebaseOrMergeInProgress,
  assertNotDetached,
  assertNoRebaseOrMerge,
  validateBranchName,
  fetch,
  hasRemoteRef,
  getAheadBehind,
} from "./git.js";
export type { GitOptions, GitRunOptions, GitRunResult } from "./git.js";

export {
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
} from "./errors.js";

export {
  EXIT_OK,
  EXIT_USER,
  EXIT_GIT,
  DEFAULT_MAIN,
  DEFAULT_DEV,
  DEFAULT_REMOTE,
  DEFAULT_PREFIXES,
  VERSION_REGEX,
  INVALID_BRANCH_CHARS,
} from "./constants.js";
