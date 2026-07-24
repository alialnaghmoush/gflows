/**
 * Help command: print quick reference and list commands/flags.
 * @module commands/help
 */

import type { ParsedArgs } from "../types.js";

/**
 * Runs the help command: prints usage, commands, types, flags, and exit codes to stdout.
 */
export async function run(_args: ParsedArgs): Promise<void> {
  const out = `
gflows — Modern Git branching workflow CLI

Usage: gflows <command> [type] [name] [flags]
       gflows                 (TTY: fullscreen hub)

Commands:
  init, -I       Ensure main, create dev (TTY: wizard; optional package.json script alias)
  start, -S      Create workflow branch (TTY: prompts if args missing)
  finish, -F     Merge and close branch (plan + delete by default)
  sync           Update current branch from its base
  pr             Open PR/MR via gh or glab (correct base)
  switch, -W     Switch branch (picker or name)
  delete, -L     Delete local branch(es)
  list, -l       List branches by type
  status, -t     Show current branch flow info
  viz            Visual branch map + flow (also shown in interactive hub)
  doctor         Repo health checks
  config         get/set .gflows.json
  bump, -U       Bump or rollback package version
  continue       Resume after merge conflict
  undo           Undo last completed gflows operation
  abort          Abort suspended operation
  schema         Machine-readable command catalog (JSON)
  mcp            Start MCP server for AI agents
  completion     Print shell completion script
  help, -h       Show this usage
  version, -V    Show version

Types: feature (-f), bugfix (-b), chore (-c), release (-r), hotfix (-x), spike (-e)

Common flags:
  -p, --push           Push after init/start/finish/pr
  -P, --no-push        Do not push (init defaults to push; start does not)
  --main <name>        Main branch (init: persist to .gflows.json)
  --dev <name>         Dev branch (init: persist to .gflows.json)
  -R, --remote <name>  Remote for push (init: persist to .gflows.json)
  -o, --from <branch>  Base branch override (e.g. -o main for bugfix)
  -B, --branch <name>  Branch name (finish/pr)
  -y, --yes            Accept plan / skip confirmations (finish: delete default on)
  -d, --dry-run        Log actions only, no writes
  -v, --verbose        Verbose output
  -q, --quiet          Minimal output
  -C, --path <dir>     Run as if in <dir>
  --json               Machine-readable output (status/list/doctor/config)

Init:   --script-alias <name>  Add package.json script (e.g. g → "gflows")
        --no-script-alias      Never add a script alias
Start:  --force         Allow dirty working tree
Finish: --no-ff         Always create merge commit; -D/--delete, -N/--no-delete;
        --squash, --preview, --bump; -s/--sign, -T/--no-tag, -M/--tag-message, -m/--message
Sync:   --rebase, --force
List:   -r, --include-remote   Include remote-tracking branches
Switch: --move | --restore | --clean | --destroy | --cancel

Exit codes: 0 success, 1 usage/validation, 2 Git or system error.

Stuck?  gflows continue | gflows abort | gflows undo | gflows doctor
Agents: see AGENTS.md, gflows schema, gflows mcp
`;
  console.log(out.trim());
}
