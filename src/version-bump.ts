/**
 * Shared semver bump helpers for package.json / jsr.json.
 * Writes preserve original file formatting (tabs vs spaces) via surgical replace.
 * @module version-bump
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { InvalidVersionError } from "./errors.js";
import { findPackageRoots, PACKAGE_JSON } from "./packages.js";
import type { BumpDirection, BumpType } from "./types.js";

/** Filename for JSR package manifests. */
export const JSR_JSON = "jsr.json";

/** Semver triplet. */
export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Matches a JSON `"version": "…"` field for in-place updates. */
const VERSION_FIELD_RE = /"version"\s*:\s*"[^"]*"/;

/**
 * Parses a version string (vX.Y.Z or X.Y.Z) into components.
 * @throws InvalidVersionError if format is invalid
 */
export function parseVersion(version: string): Semver {
  const trimmed = version.trim();
  const normalized = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  const parts = normalized.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new InvalidVersionError(
      `Invalid version '${version}'. Expected format: X.Y.Z or vX.Y.Z (e.g. 1.2.3 or v1.2.3).`,
    );
  }
  const [p0, p1, p2] = parts;
  return {
    major: parseInt(p0 ?? "0", 10),
    minor: parseInt(p1 ?? "0", 10),
    patch: parseInt(p2 ?? "0", 10),
  };
}

/**
 * Formats semver as string (no leading v, for package.json).
 */
export function formatVersion(semver: Semver): string {
  return `${semver.major}.${semver.minor}.${semver.patch}`;
}

/**
 * Computes new version for bump up (patch/minor/major).
 */
export function bumpUp(semver: Semver, type: BumpType): Semver {
  switch (type) {
    case "patch":
      return { ...semver, patch: semver.patch + 1 };
    case "minor":
      return { major: semver.major, minor: semver.minor + 1, patch: 0 };
    case "major":
      return { major: semver.major + 1, minor: 0, patch: 0 };
    default:
      return semver;
  }
}

/**
 * Computes new version for rollback (down), with floor at 0.
 */
export function bumpDown(semver: Semver, type: BumpType): Semver {
  switch (type) {
    case "patch":
      return {
        ...semver,
        patch: Math.max(0, semver.patch - 1),
      };
    case "minor":
      return {
        major: semver.major,
        minor: Math.max(0, semver.minor - 1),
        patch: 0,
      };
    case "major":
      return {
        major: Math.max(0, semver.major - 1),
        minor: semver.minor,
        patch: semver.patch,
      };
    default:
      return semver;
  }
}

/**
 * Replaces the `"version"` string value in raw JSON text without reformatting.
 * @throws InvalidVersionError if no version field string is found
 */
export function replaceVersionInJsonText(raw: string, newVersion: string): string {
  const updated = raw.replace(VERSION_FIELD_RE, `"version": "${newVersion}"`);
  if (updated === raw) {
    throw new InvalidVersionError(
      'Could not find a "version" string field to update in place. Fix the JSON file manually.',
    );
  }
  return updated;
}

/**
 * Reads version from package.json in dir.
 * @throws InvalidVersionError if version is missing or invalid
 */
export function readPackageVersion(dir: string): { raw: string; semver: Semver } {
  const path = join(dir, PACKAGE_JSON);
  if (!existsSync(path)) {
    throw new InvalidVersionError(
      `No package.json found at ${path}. Run from project root or use -C <dir>.`,
    );
  }
  const fileRaw = readFileSync(path, "utf-8");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fileRaw) as Record<string, unknown>;
  } catch {
    throw new InvalidVersionError(`Invalid JSON in ${path}.`);
  }
  const version = data.version;
  if (typeof version !== "string" || version.trim() === "") {
    throw new InvalidVersionError(
      'package.json has no valid \'version\' field. Add a "version" field (e.g. "0.0.0") to package.json.',
    );
  }
  const semver = parseVersion(version);
  return { raw: version.trim(), semver };
}

/**
 * Writes version to package.json, preserving indent style and the rest of the file.
 * @throws InvalidVersionError if the version field cannot be updated in place
 */
export function writePackageVersion(dir: string, newVersion: string): void {
  const path = join(dir, PACKAGE_JSON);
  const raw = readFileSync(path, "utf-8");
  // Ensure the file parses and has a version before writing
  readPackageVersion(dir);
  const updated = replaceVersionInJsonText(raw, newVersion);
  writeFileSync(path, updated, "utf-8");
}

/**
 * Updates version in jsr.json if the file exists. Only the version value is changed.
 * @returns true if the file was written
 */
export function syncJsrVersion(dir: string, newVersion: string): boolean {
  const path = join(dir, JSR_JSON);
  if (!existsSync(path)) return false;
  const raw = readFileSync(path, "utf-8");
  try {
    const updated = replaceVersionInJsonText(raw, newVersion);
    if (updated === raw) return false;
    writeFileSync(path, updated, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Sorted package roots under cwd (cwd first when it has a package.json).
 */
export function sortedPackageRoots(cwd: string): string[] {
  const roots = findPackageRoots(cwd);
  return [...roots].sort((a, b) => {
    if (a === cwd && b !== cwd) return -1;
    if (a !== cwd && b === cwd) return 1;
    return a.localeCompare(b);
  });
}

/** Result of computing a bump across discovered packages. */
export interface ComputedBump {
  oldVersion: string;
  newVersion: string;
  roots: string[];
  filesToUpdate: string[];
}

/**
 * Computes the next version from the primary package.json under cwd.
 * @throws InvalidVersionError if no packages or invalid version
 */
export function computeBump(cwd: string, direction: BumpDirection, type: BumpType): ComputedBump {
  const roots = sortedPackageRoots(cwd);
  if (roots.length === 0) {
    throw new InvalidVersionError(
      `No package.json found under ${cwd}. Run from project root or use -C <dir>.`,
    );
  }
  const primaryRoot = roots[0];
  if (primaryRoot === undefined) {
    throw new InvalidVersionError(
      `No package.json found under ${cwd}. Run from project root or use -C <dir>.`,
    );
  }
  const { raw: oldVersion, semver } = readPackageVersion(primaryRoot);
  const newSemver = direction === "up" ? bumpUp(semver, type) : bumpDown(semver, type);
  const newVersion = formatVersion(newSemver);

  const filesToUpdate: string[] = [];
  for (const dir of roots) {
    filesToUpdate.push(relative(cwd, join(dir, PACKAGE_JSON)) || PACKAGE_JSON);
    if (existsSync(join(dir, JSR_JSON))) {
      filesToUpdate.push(relative(cwd, join(dir, JSR_JSON)) || JSR_JSON);
    }
  }

  return { oldVersion, newVersion, roots, filesToUpdate };
}

/**
 * Applies a version to all package roots (package.json + optional jsr.json).
 * @returns relative paths that were updated
 */
export function applyVersionToPackages(cwd: string, roots: string[], newVersion: string): string[] {
  const updated: string[] = [];
  for (const dir of roots) {
    writePackageVersion(dir, newVersion);
    updated.push(relative(cwd, join(dir, PACKAGE_JSON)) || PACKAGE_JSON);
    if (syncJsrVersion(dir, newVersion)) {
      updated.push(relative(cwd, join(dir, JSR_JSON)) || JSR_JSON);
    }
  }
  return updated;
}
