/**
 * Config resolution for gflows: defaults → repo config file → CLI overrides.
 * Exposes resolved main, dev, remote, and branch type prefixes for use by commands.
 * @module config
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_DEV, DEFAULT_MAIN, DEFAULT_PREFIXES, DEFAULT_REMOTE } from "./constants.js";
import type {
  BranchPrefixes,
  BranchType,
  BranchTypeMeta,
  GflowsConfigFile,
  ResolvedConfig,
} from "./types.js";

const CONFIG_FILE = ".gflows.json";
const PACKAGE_JSON = "package.json";
const GFLOWS_KEY = "gflows";

/** CLI overrides for main, dev, and remote (e.g. --main, --dev, -R/--remote). */
export interface ConfigCliOverrides {
  main?: string;
  dev?: string;
  remote?: string;
}

/** Result of reading config file: config if valid, plus whether parsing failed (for verbose warning). */
export interface ReadConfigResult {
  config: GflowsConfigFile | null;
  /** True when a config file or package.json "gflows" key was present but invalid. */
  invalid: boolean;
}

/** Options for config resolution. */
export interface ResolveConfigOptions {
  /** If true, warn to stderr when config file is invalid. */
  verbose?: boolean;
}

/**
 * Reads and parses repo config from a directory: .gflows.json or package.json "gflows" key.
 * Returns config when valid; invalid JSON or wrong types yield null with invalid: true for warning.
 */
export function readConfigFile(dir: string): ReadConfigResult {
  const gflowsPath = join(dir, CONFIG_FILE);
  if (existsSync(gflowsPath)) {
    try {
      const raw = readFileSync(gflowsPath, "utf-8");
      const data = JSON.parse(raw) as unknown;
      const config = normalizeConfigFile(data);
      return { config, invalid: config === null };
    } catch {
      return { config: null, invalid: true };
    }
  }

  const pkgPath = join(dir, PACKAGE_JSON);
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const data = pkg[GFLOWS_KEY];
      if (data === undefined || data === null) {
        return { config: null, invalid: false };
      }
      const config = normalizeConfigFile(data);
      return { config, invalid: config === null };
    } catch {
      return { config: null, invalid: true };
    }
  }

  return { config: null, invalid: false };
}

/**
 * Normalizes and validates parsed config data. Returns a valid partial config or null if invalid.
 */
function normalizeConfigFile(data: unknown): GflowsConfigFile | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const obj = data as Record<string, unknown>;
  const out: GflowsConfigFile = {};

  if (typeof obj.main === "string" && obj.main.trim() !== "") {
    out.main = obj.main.trim();
  }
  if (typeof obj.dev === "string" && obj.dev.trim() !== "") {
    out.dev = obj.dev.trim();
  }
  if (typeof obj.remote === "string" && obj.remote.trim() !== "") {
    out.remote = obj.remote.trim();
  }
  if (
    obj.prefixes !== undefined &&
    obj.prefixes !== null &&
    typeof obj.prefixes === "object" &&
    !Array.isArray(obj.prefixes)
  ) {
    const prefs = obj.prefixes as Record<string, unknown>;
    const prefixes: BranchPrefixes = {};
    const keys: (keyof BranchPrefixes)[] = [
      "feature",
      "bugfix",
      "chore",
      "release",
      "hotfix",
      "spike",
    ];
    for (const k of keys) {
      const v = prefs[k];
      if (typeof v === "string" && v.trim() !== "") {
        prefixes[k] = v.trim();
      }
    }
    if (Object.keys(prefixes).length > 0) {
      out.prefixes = prefixes;
    }
  }

  return out;
}

/**
 * Merges prefix overrides into a full Required<BranchPrefixes> (defaults + overrides).
 */
function mergePrefixes(overrides?: BranchPrefixes): Required<BranchPrefixes> {
  const result: Required<BranchPrefixes> = { ...DEFAULT_PREFIXES };
  if (!overrides) return result;
  const keys: (keyof BranchPrefixes)[] = [
    "feature",
    "bugfix",
    "chore",
    "release",
    "hotfix",
    "spike",
  ];
  for (const k of keys) {
    if (typeof overrides[k] === "string" && overrides[k]?.trim() !== "") {
      result[k] = overrides[k]?.trim();
    }
  }
  return result;
}

/**
 * Resolves full config for the given directory: defaults → file → CLI.
 * Uses dir as the repo root for locating .gflows.json and package.json.
 *
 * @param dir - Directory to read config from (e.g. cwd or resolved -C path).
 * @param cliOverrides - Optional overrides from CLI (e.g. --main, --dev, --remote).
 * @param options - Optional { verbose } to warn when config file is missing or invalid.
 * @returns Resolved config with main, dev, remote, and full prefixes.
 */
export function resolveConfig(
  dir: string,
  cliOverrides?: ConfigCliOverrides,
  options?: ResolveConfigOptions,
): ResolvedConfig {
  const verbose = options?.verbose === true;

  let main = DEFAULT_MAIN;
  let dev = DEFAULT_DEV;
  let remote = DEFAULT_REMOTE;
  let prefixes = mergePrefixes(undefined);

  const readResult = readConfigFile(dir);
  if (readResult.invalid && verbose) {
    console.error("gflows: invalid or empty config file; using defaults.");
  }
  const file = readResult.config;
  if (file) {
    if (file.main !== undefined) main = file.main;
    if (file.dev !== undefined) dev = file.dev;
    if (file.remote !== undefined) remote = file.remote;
    if (file.prefixes !== undefined) prefixes = mergePrefixes(file.prefixes);
  }

  if (cliOverrides?.main !== undefined) main = cliOverrides.main;
  if (cliOverrides?.dev !== undefined) dev = cliOverrides.dev;
  if (cliOverrides?.remote !== undefined) remote = cliOverrides.remote;

  return { main, dev, remote, prefixes };
}

/**
 * Writes or updates .gflows.json in dir with the given partial config.
 * Merges with existing .gflows.json if present; only provided keys are updated.
 * Skips keys with empty string values.
 *
 * @param dir - Repo root directory.
 * @param partial - Keys to set (main, dev, remote, prefixes); omitted keys are left unchanged.
 */
export function writeConfigFile(dir: string, partial: Partial<GflowsConfigFile>): void {
  const path = join(dir, CONFIG_FILE);
  let existing: GflowsConfigFile = {};
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw) as unknown;
      const normalized = normalizeConfigFile(data);
      if (normalized) existing = normalized;
    } catch {
      // overwrite invalid file
    }
  }
  const merged: GflowsConfigFile = { ...existing };
  if (typeof partial.main === "string" && partial.main.trim() !== "") {
    merged.main = partial.main.trim();
  }
  if (typeof partial.dev === "string" && partial.dev.trim() !== "") {
    merged.dev = partial.dev.trim();
  }
  if (typeof partial.remote === "string" && partial.remote.trim() !== "") {
    merged.remote = partial.remote.trim();
  }
  if (
    partial.prefixes !== undefined &&
    partial.prefixes !== null &&
    typeof partial.prefixes === "object" &&
    !Array.isArray(partial.prefixes)
  ) {
    const prefs = partial.prefixes as Record<string, unknown>;
    const prefixes: BranchPrefixes = { ...(merged.prefixes ?? {}) };
    const keys: (keyof BranchPrefixes)[] = [
      "feature",
      "bugfix",
      "chore",
      "release",
      "hotfix",
      "spike",
    ];
    for (const k of keys) {
      const v = prefs[k];
      if (typeof v === "string" && v.trim() !== "") {
        prefixes[k] = v.trim();
      }
    }
    merged.prefixes = prefixes;
  }
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
}

/**
 * Returns the branch name prefix for a given branch type from resolved config.
 */
export function getPrefixForType(config: ResolvedConfig, type: BranchType): string {
  return config.prefixes[type] ?? DEFAULT_PREFIXES[type];
}

/** Metadata per branch type: base, merge target, and whether to tag on finish. */
const BRANCH_TYPE_META: Record<BranchType, BranchTypeMeta> = {
  feature: { base: "dev", mergeTarget: "dev", tagOnFinish: false },
  bugfix: { base: "dev", mergeTarget: "dev", tagOnFinish: false },
  chore: { base: "dev", mergeTarget: "dev", tagOnFinish: false },
  release: { base: "dev", mergeTarget: "main-then-dev", tagOnFinish: true },
  hotfix: { base: "main", mergeTarget: "main-then-dev", tagOnFinish: true },
  spike: { base: "dev", mergeTarget: "dev", tagOnFinish: false },
};

/**
 * Returns metadata for a branch type (base, merge target, tag on finish).
 */
export function getBranchTypeMeta(type: BranchType): BranchTypeMeta {
  return BRANCH_TYPE_META[type];
}
