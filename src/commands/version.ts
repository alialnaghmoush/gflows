/**
 * Version command: print version from the CLI's package.json.
 * @module commands/version
 */

import type { ParsedArgs } from "../types.js";
import { getVersion } from "../version.js";

/**
 * Runs the version command: prints package version to stdout.
 * @param _args - Parsed CLI args (unused; kept for command signature consistency).
 */
export async function run(_args: ParsedArgs): Promise<void> {
  console.log(getVersion());
}
