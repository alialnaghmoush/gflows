# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-07-25

### Added

- `gflows info` — describe repo layout (monolith vs monorepo), package versions, and detected frontend / fullstack / backend stacks (`--json` supported)
- Hub `/info` read-only screen; MCP tool `gflows_info`

## [1.0.4] - 2026-07-25

### Fixed

- Hub switch flow typecheck when HEAD is detached (`current` may be null)

## [1.0.3] - 2026-07-25

### Fixed

- Hub interactive actions no longer freeze/exit after Ink unmount (`stdin.ref` before dispatch; Clack cancel no longer `process.exit`s the hub)
- `/switch`, `/init`, `/bump` wizards run inside Ink (same as start/list)

### Changed

- Local `bun run g` script invokes `src/cli.ts` so the hub gets a real TTY

## [1.0.2] - 2026-07-25

### Changed

- Hub read-only screens stay in Ink: `/doctor`, `/help`, `/status`, `/config`, `/version` (enter/esc return)

## [1.0.1] - 2026-07-25

### Added

- Fullscreen **Ink** TUI hub (`gflows` on TTY): bordered frame, tips / what’s next, actions, `❯` slash prompt, status bar
- Slash commands: `/init` `/start` `/sync` `/pr` `/finish` `/doctor` `/help` …
- In-hub `/` autocomplete (↑↓ select, Tab complete, Enter run)
- Interactive prompts via **@clack/prompts** (Inquirer removed)
- Legacy Clack menu fallback when TUI cannot run; `gflows viz` for scrollback panel
- `gflows init`: optional `package.json` script alias (`--script-alias g`, TTY prompt); docs recommend shell `alias g=gflows` for shortest DX
- Hub wizards (`/start`, `/finish`, `/sync`, `/list`) run **inside Ink** (fewer drop-outs); only git dispatch leaves the TUI

### Fixed

- Hub no longer exits after dispatch (`stdin.ref` after Ink unmount; alternate screen)
- `/list` renders a styled in-hub branch view instead of plain stdout under a tall gap

## [1.0.0] - 2026-07-24

### Added

- Interactive hub: bare `gflows` in a TTY opens a guided menu
- `gflows sync` — update workflow branch from base (merge/rebase, stash-aware)
- `gflows pr` — open PR/MR via `gh` or `glab` against the correct base
- `gflows doctor`, `gflows config get|set`, `gflows schema`, `gflows mcp`
- Recovery: `gflows continue`, `gflows undo`, `gflows abort` with run-state under `.git/gflows/`
- Finish plan preview, `--squash`, `--preview`, `--bump`, empty/dirty finish guards
- Delete-after-finish defaults **on** (`-N` to keep); `-y` accepts the plan
- Bugfix-from-main finish merges to main then dev
- `--json` on status/list/doctor; hints go to stderr (stdout stays scriptable)
- `AGENTS.md` + `llms.txt` for AI agents
- Kebab-case long flags (`--dry-run`, `--no-ff`, `--no-delete`, …) bind correctly
- Merge `-m` / `--message` wired through to git merge

### Fixed

- Documented flags that previously did not parse
- Help text incorrectly claimed start pushes by default
- Finish picker prefers the current workflow branch
