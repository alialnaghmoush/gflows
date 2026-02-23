/**
 * Version command: print version from the CLI's package.json.
 * @module commands/version
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedArgs } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs the version command: reads version from package.json (repo root when
 * developing, package root when installed) and prints it to stdout.
 * @param _args - Parsed CLI args (unused; kept for command signature consistency).
 */
export async function run(_args: ParsedArgs): Promise<void> {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  try {
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    console.log(pkg.version ?? "0.0.0");
  } catch {
    console.log("0.0.0");
  }
}
