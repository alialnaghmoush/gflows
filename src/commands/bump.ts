/**
 * Bump command: bump or rollback root package version (patch/minor/major).
 * Keeps package.json and jsr.json in sync; no git operations.
 * @module commands/bump
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../types.js";
import type { BumpDirection, BumpType } from "../types.js";
import { EXIT_OK, EXIT_USER } from "../constants.js";
import { InvalidVersionError } from "../errors.js";
import { hint, success } from "../out.js";

const PACKAGE_JSON = "package.json";
const JSR_JSON = "jsr.json";

/** Semver triplet. */
interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parses a version string (vX.Y.Z or X.Y.Z) into components.
 * @throws InvalidVersionError if format is invalid
 */
function parseVersion(version: string): Semver {
  const trimmed = version.trim();
  const normalized = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  const parts = normalized.split(".");
  if (
    parts.length !== 3 ||
    parts.some((p) => !/^\d+$/.test(p))
  ) {
    throw new InvalidVersionError(
      `Invalid version '${version}'. Expected format: X.Y.Z or vX.Y.Z (e.g. 1.2.3 or v1.2.3).`
    );
  }
  return {
    major: parseInt(parts[0]!, 10),
    minor: parseInt(parts[1]!, 10),
    patch: parseInt(parts[2]!, 10),
  };
}

/**
 * Formats semver as string (no leading v, for package.json).
 */
function formatVersion(semver: Semver): string {
  return `${semver.major}.${semver.minor}.${semver.patch}`;
}

/**
 * Computes new version for bump up (patch/minor/major).
 */
function bumpUp(semver: Semver, type: BumpType): Semver {
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
function bumpDown(semver: Semver, type: BumpType): Semver {
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
 * Reads version from package.json in dir.
 * @throws InvalidVersionError if version is missing or invalid
 */
function readPackageVersion(dir: string): { raw: string; semver: Semver } {
  const path = join(dir, PACKAGE_JSON);
  if (!existsSync(path)) {
    throw new InvalidVersionError(
      `No package.json found at ${path}. Run from project root or use -C <dir>.`
    );
  }
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  const version = data.version;
  if (typeof version !== "string" || version.trim() === "") {
    throw new InvalidVersionError(
      "package.json has no valid 'version' field. Add a \"version\" field (e.g. \"0.0.0\") to package.json."
    );
  }
  const semver = parseVersion(version);
  return { raw: version.trim(), semver };
}

/**
 * Writes version to package.json, preserving other keys and formatting as much as possible.
 * Uses JSON.stringify with 2 spaces for consistency.
 */
function writePackageVersion(dir: string, newVersion: string): void {
  const path = join(dir, PACKAGE_JSON);
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  data.version = newVersion;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Updates version in jsr.json if the file exists; preserves other keys.
 */
function syncJsrVersion(dir: string, newVersion: string): boolean {
  const path = join(dir, JSR_JSON);
  if (!existsSync(path)) return false;
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  data.version = newVersion;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return true;
}

/**
 * Run the bump command.
 * Interactive (select direction and type) when TTY and args omitted; otherwise require both.
 * With --dry-run, only prints old→new and files that would be updated.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, bumpDirection, bumpType, dryRun, quiet } = args;

  let direction: BumpDirection;
  let type: BumpType;

  const isTTY =
    typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;

  if (bumpDirection && bumpType) {
    direction = bumpDirection;
    type = bumpType;
  } else if (!isTTY) {
    console.error(
      "gflows bump: when not in a TTY, both direction and type are required. Example: gflows bump up patch"
    );
    process.exit(EXIT_USER);
  } else {
    const { select } = await import("@inquirer/prompts");
    direction = await select({
      message: "Direction",
      choices: [
        { name: "Up (bump)", value: "up" as const },
        { name: "Down (rollback)", value: "down" as const },
      ],
    });
    type = await select({
      message: "Type",
      choices: [
        { name: "patch (x.y.Z)", value: "patch" as const },
        { name: "minor (x.Y.0)", value: "minor" as const },
        { name: "major (X.0.0)", value: "major" as const },
      ],
    });
  }

  const { raw: oldVersion, semver } = readPackageVersion(cwd);
  const newSemver =
    direction === "up" ? bumpUp(semver, type) : bumpDown(semver, type);
  const newVersion = formatVersion(newSemver);

  const filesToUpdate: string[] = [PACKAGE_JSON];
  if (existsSync(join(cwd, JSR_JSON))) {
    filesToUpdate.push(JSR_JSON);
  }

  if (dryRun) {
    if (!quiet) {
      success(`Would bump version: ${oldVersion} → ${newVersion}`);
      success(`Would update: ${filesToUpdate.join(", ")}`);
    }
    process.exit(EXIT_OK);
  }

  writePackageVersion(cwd, newVersion);
  const jsrUpdated = syncJsrVersion(cwd, newVersion);

  if (!quiet) {
    success(`Bumped version: ${oldVersion} → ${newVersion}`);
    const updated = [PACKAGE_JSON];
    if (jsrUpdated) updated.push(JSR_JSON);
    success(`Updated: ${updated.join(", ")}`);
    // Hint: suggest next step — commit and start release branch
    hint("Commit the change, then run gflows start release vX.Y.Z to release.");
  }
}
