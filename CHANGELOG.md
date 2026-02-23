# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.9] - 2025-02-23

### Added

- **init** — Flags `--main`, `--dev`, and `-R`/`--remote` to set branch/remote names and persist them to `.gflows.json` (after a successful init; skipped with `--dry-run`).
- **All commands** — `--main`, `--dev`, and `-R`/`--remote` work as one-off overrides for config (start, finish, list, status, delete, switch).
- Library export `writeConfigFile` for programmatic config writes.

### Removed

- Environment-based config (`GFLOWS_MAIN`, `GFLOWS_DEV`, `GFLOWS_REMOTE`). Config resolution is now: defaults → `.gflows.json` / `package.json` "gflows" → CLI flags.

### Changed

- Config resolution order documented and implemented as defaults → file → CLI (no env step).
- Quick start and Configuration sections in README updated for init flags and removal of env vars.

## [0.1.0] - 2025-02-23

### Added

- Initial release of gflows CLI
- Commands: init, start, finish, switch, delete, list, status, bump, completion, help, version
- Branch types: feature, bugfix, chore, release, hotfix (optional: spike)
- Config via `.gflows.json` or `package.json` gflows key; CLI flags (e.g. `--main`, `--dev`, `-R`)
- Interactive prompts (@inquirer/prompts) when TTY; scriptable with `-y` and explicit args
- Publish script for npm and JSR with version sync and dry-run

[Unreleased]: https://github.com/alialnaghmoush/gflows/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/alialnaghmoush/gflows/releases/tag/v0.1.9
[0.1.0]: https://github.com/alialnaghmoush/gflows/releases/tag/v0.1.0
