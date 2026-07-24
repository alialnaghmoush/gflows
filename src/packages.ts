/**
 * Shared package.json discovery for monorepo-aware commands (bump, info).
 * @module packages
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Filename for Node/Bun package manifests. */
export const PACKAGE_JSON = "package.json";

/** Directory names to skip when discovering package roots. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".cache",
]);

/**
 * Recursively finds all directories under `root` that contain a package.json.
 * Skips node_modules, .git, and common build/cache dirs.
 */
export function findPackageRoots(root: string): string[] {
  const acc: string[] = [];
  if (!existsSync(root) || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    return acc;
  }
  if (existsSync(join(root, PACKAGE_JSON))) {
    acc.push(root);
  }
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = readdirSync(root, { withFileTypes: true }) as Array<{
      isDirectory(): boolean;
      name: string;
    }>;
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith(".") && e.name !== ".") continue;
    acc.push(...findPackageRoots(join(root, e.name)));
  }
  return acc;
}

/** Minimal package.json fields used by inspectors. */
export interface PackageJsonFields {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Reads and parses package.json from a directory. Returns null if missing or invalid.
 */
export function readPackageJson(dir: string): PackageJsonFields | null {
  const path = join(dir, PACKAGE_JSON);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as PackageJsonFields;
  } catch {
    return null;
  }
}
