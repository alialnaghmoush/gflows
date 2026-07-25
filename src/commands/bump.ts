/**
 * Bump command: bump or rollback package version (patch/minor/major).
 * Supports monorepos: discovers all package.json and jsr.json under cwd and bumps them to the same version.
 * Keeps package.json and jsr.json in sync; no git operations.
 * @module commands/bump
 */

import { EXIT_OK, EXIT_USER } from "../constants.js";
import { hint, success } from "../out.js";
import type { BumpDirection, BumpType, ParsedArgs } from "../types.js";
import { applyVersionToPackages, computeBump } from "../version-bump.js";

/**
 * Run the bump command.
 * Interactive (select direction and type) when TTY and args omitted; otherwise require both.
 * With --dry-run, only prints old→new and files that would be updated.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const { cwd, bumpDirection, bumpType, dryRun, quiet } = args;

  let direction: BumpDirection;
  let type: BumpType;

  const isTTY = typeof process.stdin.isTTY === "boolean" && process.stdin.isTTY;

  if (bumpDirection && bumpType) {
    direction = bumpDirection;
    type = bumpType;
  } else if (!isTTY) {
    console.error(
      "gflows bump: when not in a TTY, both direction and type are required. Example: gflows bump up patch",
    );
    process.exit(EXIT_USER);
  } else {
    const { selectPrompt } = await import("../prompts.js");
    direction = await selectPrompt<"up" | "down">({
      message: "Direction",
      options: [
        { label: "Up (bump)", value: "up" },
        { label: "Down (rollback)", value: "down" },
      ],
    });
    type = await selectPrompt<"patch" | "minor" | "major">({
      message: "Type",
      options: [
        { label: "patch (x.y.Z)", value: "patch" },
        { label: "minor (x.Y.0)", value: "minor" },
        { label: "major (X.0.0)", value: "major" },
      ],
    });
  }

  const { oldVersion, newVersion, roots, filesToUpdate } = computeBump(cwd, direction, type);

  if (dryRun) {
    if (!quiet) {
      success(`Would bump version: ${oldVersion} → ${newVersion}`);
      success(`Would update: ${filesToUpdate.join(", ")}`);
    }
    process.exit(EXIT_OK);
  }

  const updated = applyVersionToPackages(cwd, roots, newVersion);

  if (!quiet) {
    success(`Bumped version: ${oldVersion} → ${newVersion}`);
    success(`Updated: ${updated.join(", ")}`);
    hint(
      "Commit the change, then run gflows start release vX.Y.Z — or gflows release up <type> from dev.",
    );
  }
}
