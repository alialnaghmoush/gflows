/**
 * Help command: print quick reference from the spec and list commands/flags.
 * @module commands/help
 */

import type { ParsedArgs } from "../types.js";

/**
 * Runs the help command: prints usage, commands, types, flags, and exit codes to stdout.
 * @param _args - Parsed CLI args (unused; kept for command signature consistency).
 */
export async function run(_args: ParsedArgs): Promise<void> {
  const out = `
gflows — Modern Git branching workflow CLI

Usage: gflows <command> [type] [name] [flags]

Commands:
  init, -I       Ensure main, create dev
  start, -S      Create workflow branch
  finish, -F     Merge and close branch
  switch, -W     Switch branch (picker or name)
  delete, -L     Delete local branch(es)
  list, -l       List branches by type
  bump           Bump or rollback package version
  completion     Print shell completion script
  status, -t     Show current branch flow info
  help, -h       Show this usage
  version, -V    Show version

Types: feature (-f), bugfix (-b), chore (-c), release (-r), hotfix (-x), spike (-e)

Common flags:
  -p, --push           Push after init/start/finish
  -P, --no-push        Do not push (finish: prompts "Do you want to push?" when neither -p nor -P)
  --main <name>        Main branch (init: persist to .gflows.json)
  --dev <name>         Dev branch (init: persist to .gflows.json)
  -R, --remote <name>  Remote for push (init: persist to .gflows.json)
  -o, --from <branch>  Base branch override (e.g. -o main for bugfix)
  -B, --branch <name>  Branch name (finish: branch to finish)
  -y, --yes            Skip confirmations
  -d, --dry-run        Log actions only, no writes
  -v, --verbose        Verbose output
  -q, --quiet          Minimal output
  -C, --path <dir>     Run as if in <dir>

Start:  --force         Allow dirty working tree
Finish: --no-ff         Always create merge commit; -D/--delete, -N/--no-delete;
        -s/--sign, -T/--no-tag, -M/--tag-message, -m/--message
List:   -r, --include-remote   Include remote-tracking branches

Exit codes: 0 success, 1 usage/validation, 2 Git or system error.

Hints:
  • gflows init then gflows start feature <name> — set up and create first branch
  • gflows finish <type> — merge current workflow branch (use -B <name> to specify branch)
  • gflows list -r — include remote branches; gflows status — show current branch flow
`;
  console.log(out.trim());
}
