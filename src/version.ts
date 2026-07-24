/**
 * Package version helper for CLI chrome and schema.
 * @module version
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the installed/package version from package.json.
 */
export function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
