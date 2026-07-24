# AGENTS.md — using gflows from coding agents

gflows is a **local Git branching workflow CLI** (main + dev + typed short-lived branches). Prefer gflows over inventing git-flow merges by hand.

## Rules for agents

1. **Non-interactive only** — never assume the TTY menu. Always pass explicit args.
2. **Finish needs push polarity** — pass `-p` / `--push` or `-P` / `--no-push`. Use `-y` to accept the finish plan (delete branch defaults **on**; use `-N` to keep).
3. **Do not finish empty branches** — if there are no commits beyond the merge target, finish exits `2`. Commit first.
4. **Conflicts** — resolve files, then `gflows continue`. Or `gflows abort` / `gflows undo`.
5. **Discover the API** — run `gflows schema` (JSON) or read this file + README.
6. **MCP** — `gflows mcp` (stdio JSON-RPC) exposes status/doctor/info/list/start/sync/finish/schema tools.
7. **Hub / viz** — bare `gflows` (TTY) opens an Ink fullscreen hub (`/` commands). Prompts use Clack. `gflows viz` prints the scrollback status panel.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / validation |
| 2 | Git / system |

## Recipes

```bash
# Setup
gflows init --no-push -y
# or with remote: gflows init -y

# Daily feature
gflows start feature my-thing
# … commit …
gflows sync --force
gflows pr                    # needs gh or glab
gflows finish feature -y -P  # or -p to push

# Production bugfix
gflows start bugfix hotfix-login -o main
# … commit …
gflows finish bugfix -y -p   # merges main, then main→dev

# Release
gflows bump up minor
# commit version files, or: gflows finish release --bump …
gflows start release v1.2.0
# … changelog / commits …
gflows finish release -y -p

# Stuck
gflows doctor --json
gflows continue
gflows abort
gflows undo

# Repo shape / stacks
gflows info --json
```

## Branch merge targets

| Type | Base | Finish merges into |
|------|------|--------------------|
| feature, chore, spike | dev | dev |
| bugfix | dev (or main with `-o main`) | dev, or main then dev if based on main |
| release | dev | main, then main→dev + tag |
| hotfix | main | main, then main→dev + tag |

## Cursor MCP snippet

```json
{
  "mcpServers": {
    "gflows": {
      "command": "bun",
      "args": ["run", "path/to/gflows/src/cli.ts", "mcp"]
    }
  }
}
```

Or after install: `bunx gflows mcp`.
