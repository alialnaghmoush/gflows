/**
 * Library entry for gflows. Re-exports types, config, git helpers, and errors
 * for programmatic use. The CLI is invoked via the `gflows` binary (see package.json bin).
 * @module
 */

export type {
  ConfigCliOverrides,
  ReadConfigResult,
  ResolveConfigOptions,
} from "./config.js";
export {
  getBranchTypeMeta,
  getPrefixForType,
  readConfigFile,
  resolveConfig,
  writeConfigFile,
} from "./config.js";
export {
  DEFAULT_DEV,
  DEFAULT_MAIN,
  DEFAULT_PREFIXES,
  DEFAULT_REMOTE,
  EXIT_GIT,
  EXIT_OK,
  EXIT_USER,
  INVALID_BRANCH_CHARS,
  VERSION_REGEX,
} from "./constants.js";
export {
  BranchNotFoundError,
  CannotDeleteMainOrDevError,
  DetachedHeadError,
  DirtyWorkingTreeError,
  exitCodeForError,
  GflowsError,
  InvalidBranchNameError,
  InvalidVersionError,
  MergeConflictError,
  NotRepoError,
  RebaseMergeInProgressError,
} from "./errors.js";
export type { GitOptions, GitRunOptions, GitRunResult } from "./git.js";
export {
  assertNoRebaseOrMerge,
  assertNotDetached,
  branchList,
  checkout,
  deleteBranch,
  ensureGitRepo,
  fetch,
  getAheadBehind,
  getCurrentBranch,
  hasRemoteRef,
  isClean,
  isDetachedHead,
  isRebaseOrMergeInProgress,
  merge,
  push,
  resolveRepoRoot,
  revParse,
  runGit,
  tag,
  tagExists,
  validateBranchName,
} from "./git.js";
export type {
  BranchPrefixes,
  BranchType,
  BranchTypeBase,
  BranchTypeMeta,
  BumpDirection,
  BumpType,
  Command,
  GflowsConfigFile,
  MergeTarget,
  ParsedArgs,
  ResolvedConfig,
} from "./types.js";
export { BRANCH_TYPE_SHORTS } from "./types.js";
