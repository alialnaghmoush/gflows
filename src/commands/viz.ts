/**
 * Visual map of main/dev + workflow branches and “you are here” next steps.
 * @module commands/viz
 */

import type { ParsedArgs } from "../types.js";
import { printViz } from "../viz.js";

/**
 * Prints an interactive-friendly branch/flow visualization to stdout.
 */
export async function run(args: ParsedArgs): Promise<void> {
  await printViz(args.cwd, {
    main: args.main,
    dev: args.dev,
    remote: args.remote,
  });
}
