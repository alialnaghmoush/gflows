/**
 * Helpers for optional package.json script aliases (e.g. "g": "gflows").
 * @module package-scripts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_JSON = "package.json";
const SCRIPT_VALUE = "gflows";

/** Result of attempting to add a script alias. */
export type ScriptAliasResult =
  | { status: "added"; name: string }
  | { status: "unchanged"; name: string }
  | { status: "conflict"; name: string; existing: string }
  | { status: "no-package" }
  | { status: "invalid"; name: string };

/**
 * Validates a package.json script name (npm/bun safe subset).
 */
export function isValidScriptAliasName(name: string): boolean {
  return /^[a-z][a-z0-9:_-]*$/i.test(name) && name.length <= 64;
}

/**
 * Ensures `scripts[name] = "gflows"` in the nearest package.json under repoRoot.
 * Does not overwrite a different existing script value.
 */
export function ensureGflowsScriptAlias(
  repoRoot: string,
  name: string,
  options?: { dryRun?: boolean },
): ScriptAliasResult {
  if (!isValidScriptAliasName(name)) {
    return { status: "invalid", name };
  }

  const pkgPath = join(repoRoot, PACKAGE_JSON);
  if (!existsSync(pkgPath)) {
    return { status: "no-package" };
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return { status: "no-package" };
  }

  const scripts =
    pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts)
      ? { ...(pkg.scripts as Record<string, unknown>) }
      : {};

  const existing = scripts[name];
  if (typeof existing === "string") {
    if (existing === SCRIPT_VALUE || existing.trim() === SCRIPT_VALUE) {
      return { status: "unchanged", name };
    }
    return { status: "conflict", name, existing };
  }

  if (options?.dryRun) {
    return { status: "added", name };
  }

  scripts[name] = SCRIPT_VALUE;
  pkg.scripts = scripts;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
  return { status: "added", name };
}
