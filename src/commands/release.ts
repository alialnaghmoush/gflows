/**
 * Quick release from the long-lived `dev` branch: bump (or keep), merge into main, tag, sync main→dev.
 * @module commands/release
 */

import { join } from "node:path";
import { resolveConfig } from "../config.js";
import { EXIT_USER } from "../constants.js";
import { DirtyWorkingTreeError, NothingToFinishError } from "../errors.js";
import { normalizeTagVersion } from "../flow.js";
import {
  assertNoRebaseOrMerge,
  assertNotDetached,
  getAheadBehind,
  getCurrentBranch,
  isClean,
  resolveRepoRoot,
  runGit,
  tagExists,
} from "../git.js";
import { hint, success } from "../out.js";
import { PACKAGE_JSON } from "../packages.js";
import type { BumpType, ParsedArgs } from "../types.js";
import {
  applyVersionToPackages,
  computeBump,
  JSR_JSON,
  readPackageVersion,
  sortedPackageRoots,
} from "../version-bump.js";
import { type FinishContext, runFinishPlan } from "./finish.js";

/** Interactive choice: keep package version as-is, or bump a semver segment. */
type ReleaseVersionChoice = "current" | BumpType;

/**
 * Runs quick release: only valid when HEAD is the configured `dev` branch.
 */
export async function run(args: ParsedArgs): Promise<void> {
  const repoRoot = await resolveRepoRoot(args.cwd);
  const config = resolveConfig(
    repoRoot,
    { main: args.main, dev: args.dev, remote: args.remote },
    { verbose: args.verbose },
  );

  const opts = { dryRun: args.dryRun, verbose: args.verbose, quiet: args.quiet };
  const isTTY = Boolean(process.stdin.isTTY);

  await assertNotDetached(repoRoot);
  assertNoRebaseOrMerge(repoRoot);

  const current = await getCurrentBranch(repoRoot, opts);
  if (!current || current !== config.dev) {
    console.error(
      `gflows release: must be on '${config.dev}' (currently ${current ? `'${current}'` : "detached"}).`,
    );
    hint("Checkout dev, or use: gflows start release vX.Y.Z && gflows finish release -y -P");
    process.exit(2);
  }

  if (!args.force) {
    const clean = await isClean(repoRoot, opts);
    if (!clean) {
      throw new DirtyWorkingTreeError(
        "Working tree has uncommitted changes. Commit or stash them before release, or use --force.",
      );
    }
  }

  const { ahead } = await getAheadBehind(repoRoot, config.main, config.dev, opts);
  if (ahead === 0) {
    throw new NothingToFinishError(
      `Nothing to release: '${config.dev}' has no commits beyond '${config.main}'.`,
    );
  }

  let keepCurrent = args.keepCurrent === true;
  let bumpType: BumpType | undefined = args.bumpType;

  if (args.bumpDirection === "down") {
    console.error(
      "gflows release: only 'up' or 'current' is supported (not 'down'). Example: gflows release up patch",
    );
    process.exit(EXIT_USER);
  }
  if (args.bumpDirection && args.bumpDirection !== "up") {
    console.error(
      "gflows release: expected 'up <patch|minor|major>' or 'current'. Example: gflows release up patch",
    );
    process.exit(EXIT_USER);
  }
  if (keepCurrent && (args.bumpDirection || bumpType)) {
    console.error("gflows release: use either 'current' or 'up <patch|minor|major>', not both.");
    process.exit(EXIT_USER);
  }

  if (!keepCurrent && !bumpType) {
    if (!isTTY) {
      console.error(
        "gflows release: when not in a TTY, specify version mode. Examples: gflows release current -y -P  or  gflows release up patch -y -P",
      );
      process.exit(EXIT_USER);
    }
    const { selectPrompt } = await import("../prompts.js");
    const computedPreview = (() => {
      try {
        return computeBump(repoRoot, "up", "patch");
      } catch {
        return null;
      }
    })();
    const currentVer = computedPreview?.oldVersion ?? "?";
    // `release up` already chose bumping — only ask which segment.
    if (args.bumpDirection === "up") {
      bumpType = await selectPrompt<BumpType>({
        message: `Bump version (current ${currentVer})`,
        options: [
          { label: "patch (x.y.Z)", value: "patch" },
          { label: "minor (x.Y.0)", value: "minor" },
          { label: "major (X.0.0)", value: "major" },
        ],
      });
    } else {
      const choice = await selectPrompt<ReleaseVersionChoice>({
        message: `Version for release (current ${currentVer})`,
        options: [
          { label: `keep current (${currentVer})`, value: "current" },
          { label: "bump patch (x.y.Z)", value: "patch" },
          { label: "bump minor (x.Y.0)", value: "minor" },
          { label: "bump major (X.0.0)", value: "major" },
        ],
      });
      if (choice === "current") {
        keepCurrent = true;
      } else {
        bumpType = choice;
      }
    }
  }

  let doPush = false;
  if (args.push && !args.noPush) doPush = true;
  else if (args.noPush) doPush = false;
  else if (!isTTY) {
    console.error("gflows release: specify --push (-p) or --no-push (-P) when not interactive.");
    process.exit(EXIT_USER);
  } else if (!args.yes) {
    const { confirmPrompt } = await import("../prompts.js");
    doPush = await confirmPrompt({
      message: "Push after release?",
      initialValue: false,
    });
  } else {
    // -y without push polarity in TTY: default no-push (same as finish when -y alone)
    doPush = false;
  }

  let oldVersion: string;
  let newVersion: string;
  let roots: string[];

  if (keepCurrent) {
    roots = sortedPackageRoots(repoRoot);
    if (roots.length === 0) {
      console.error(
        `gflows release: no package.json found under ${repoRoot}. Run from project root or use -C <dir>.`,
      );
      process.exit(EXIT_USER);
    }
    const primaryRoot = roots[0];
    if (primaryRoot === undefined) {
      console.error(
        `gflows release: no package.json found under ${repoRoot}. Run from project root or use -C <dir>.`,
      );
      process.exit(EXIT_USER);
    }
    oldVersion = readPackageVersion(primaryRoot).raw;
    newVersion = oldVersion;
  } else {
    if (!bumpType) {
      console.error(
        "gflows release: expected 'up <patch|minor|major>' or 'current'. Example: gflows release up patch",
      );
      process.exit(EXIT_USER);
    }
    ({ oldVersion, newVersion, roots } = computeBump(repoRoot, "up", bumpType));
  }

  const tagName = normalizeTagVersion(newVersion);

  if (await tagExists(repoRoot, tagName, opts)) {
    console.error(`gflows release: tag '${tagName}' already exists.`);
    hint(
      keepCurrent
        ? "Bump the version first, or delete the tag if you intend to recreate it."
        : "Use a different bump (minor/major), or delete the tag if you intend to recreate it.",
    );
    process.exit(2);
  }

  console.error("gflows release plan:");
  console.error(`  from:    ${config.dev}`);
  if (keepCurrent) {
    console.error(`  version: ${newVersion} (keep current, no bump)`);
  } else {
    console.error(`  bump:    ${oldVersion} → ${newVersion}`);
  }
  console.error(`  merge:   → ${config.main}, then ${config.main} → ${config.dev}`);
  console.error(`  tag:     ${tagName}`);
  console.error(`  push:    ${doPush ? "yes" : "no"}`);

  if (args.preview) {
    success("gflows: preview only (no changes).");
    return;
  }

  if (!args.yes && isTTY) {
    const { confirmPrompt } = await import("../prompts.js");
    const ok = await confirmPrompt({
      message: "Proceed with quick release?",
      initialValue: true,
    });
    if (!ok) {
      success("gflows: release cancelled.");
      return;
    }
  } else if (!args.yes && !isTTY) {
    console.error("gflows release: pass -y to accept the plan when not interactive.");
    process.exit(EXIT_USER);
  }

  if (!keepCurrent && !opts.dryRun) {
    applyVersionToPackages(repoRoot, roots, newVersion);
    for (const dir of roots) {
      await runGit(["add", "--", join(dir, PACKAGE_JSON)], {
        cwd: repoRoot,
        dryRun: false,
        verbose: args.verbose,
      }).catch(() => undefined);
      await runGit(["add", "--", join(dir, JSR_JSON)], {
        cwd: repoRoot,
        dryRun: false,
        verbose: args.verbose,
      }).catch(() => undefined);
    }
    await runGit(["commit", "-m", `chore: bump to ${newVersion}`], {
      cwd: repoRoot,
      dryRun: false,
      verbose: args.verbose,
    });
    if (!args.quiet) {
      success(`gflows: bumped version ${oldVersion} → ${newVersion} and committed.`);
    }
  }

  const ctx: FinishContext = {
    branchToFinish: config.dev,
    type: "release",
    version: newVersion,
    mergeTarget: "main-then-dev",
    shouldDelete: false,
    doPush,
    noFf: args.noFf,
    squash: false,
    message: args.message,
    signTag: args.signTag,
    noTag: false,
    tagMessage: args.tagMessage,
    remote: args.remote ?? config.remote,
    main: config.main,
    dev: config.dev,
    bumpOnFinish: false,
  };

  await runFinishPlan(repoRoot, ctx, {
    ...opts,
    printPlan: false,
  });
}
