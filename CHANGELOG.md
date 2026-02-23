# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-02-23

### Added

- Initial release of gflows CLI
- Commands: init, start, finish, switch, delete, list, status, bump, completion, help, version
- Branch types: feature, bugfix, chore, release, hotfix (optional: spike)
- Config via `.gflows.json` or `package.json` gflows key; env overrides
- Interactive prompts (@inquirer/prompts) when TTY; scriptable with `-y` and explicit args
- Publish script for npm and JSR with version sync and dry-run

[Unreleased]: https://github.com/alialnaghmoush/gflows/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alialnaghmoush/gflows/releases/tag/v0.1.0
