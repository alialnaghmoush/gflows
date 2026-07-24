/**
 * Shared command dispatch for the hub and TUI (parse argv → command module).
 * @module dispatch
 */

import { parse } from "./parse.js";
import type { ParsedArgs } from "./types.js";

/**
 * Dispatches a command by re-parsing argv and calling the command module.
 */
export async function dispatch(cwd: string, argv: string[]): Promise<void> {
  const args: ParsedArgs = parse(["-C", cwd, ...argv]);
  if (args.command === "help") {
    const { run } = await import("./commands/help.js");
    await run(args);
    return;
  }
  const mod = await import(`./commands/${args.command}.js`);
  await mod.run(args);
}
