/**
 * Info: describe repo layout, package versions, and detected stacks.
 * @module commands/info
 */

import { resolveRepoRoot } from "../git.js";
import { collectInfoReport, formatInfoReport } from "../repo-inspect.js";
import type { ParsedArgs } from "../types.js";

/**
 * Collects repo info without printing (CLI + hub).
 */
export async function collectInfo(cwd: string) {
  const repoRoot = await resolveRepoRoot(cwd);
  return collectInfoReport(repoRoot);
}

/**
 * Runs the info command (human or JSON).
 */
export async function run(args: ParsedArgs): Promise<void> {
  const report = await collectInfo(args.cwd);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = formatInfoReport(report);
  for (const line of lines) {
    console.log(line);
  }
}
