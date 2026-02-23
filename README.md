# gflows

A lightweight CLI for consistent Git branching workflows: long-lived **main** (production) and **dev** (integration), plus short-lived workflow branches with clear merge targets. Built for [Bun](https://bun.sh) and TypeScript; **scriptable** and **safe by default**—no history rewriting, predictable exit codes, and optional interactive pickers only when running in a TTY.

**Author:** [Ali AlNaghmoush](https://github.com/alialnaghmoush) · **Repository:** [github.com/alialnaghmoush/gflows](https://github.com/alialnaghmoush/gflows)

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Concepts](#concepts)
- [Quick start](#quick-start)
- [Command reference](#command-reference)
- [Branch types in detail](#branch-types-in-detail)
- [Configuration](#configuration)
- [Scripting and CI](#scripting-and-ci)
- [Exit codes](#exit-codes)
- [Troubleshooting](#troubleshooting)
- [Shell completion](#shell-completion)
- [Publishing (maintainers)](#publishing-maintainers)
- [License](#license)

---

## Prerequisites

- **Bun** ≥ 1.0 (recommended). The CLI runs TypeScript directly; no separate build step.
- **Git** for all repository operations.

Check versions:

```bash
bun --version
git --version
```

---

## Installation

**From the repository (development or link):**

```bash
git clone https://github.com/alialnaghmoush/gflows.git
cd gflows
bun install
bun link    # global `gflows` (or: npm link)
```

**Run without installing** (from repo root):

```bash
bun run gflows -- <command> ...
# or
bun run src/cli.ts -- <command> ...
```

**After linking**, use `gflows` from any Git repository:

```bash
cd /path/to/your/repo
gflows init
gflows start feature my-feature
```

---

## Concepts

- **main** — Long-lived production branch. Default name: `main`. Only release and hotfix branches merge here.
- **dev** — Long-lived integration branch. Default name: `dev`. Feature, bugfix, chore, and spike branches merge here. Created by `gflows init` from `main`.
- **Workflow branches** — Short-lived branches with a type prefix (e.g. `feature/`, `bugfix/`, `release/`). Each type has a **base** branch and **merge target(s)**. gflows never rewrites history (no rebase by default).
- **Merge targets** — Where `gflows finish` merges:
  - **feature / chore / spike** → `dev` only.
  - **bugfix** → `dev` (or `main` if the bugfix was started from main with `-o main`).
  - **release** → `main` first, then `main` is merged into `dev`; a tag is created.
  - **hotfix** → `main` first, then `main` is merged into `dev`; a tag is created.

You can override branch names and prefixes via [configuration](#configuration).

---

## Quick start

**1. One-time setup** in your repo (ensure `main` exists and create `dev`):

```bash
gflows init
gflows init --push        # also push dev to origin
gflows init --dry-run     # show what would be done, no writes
```

**2. Daily development** (feature → dev):

```bash
gflows start feature add-login
# ... code, commit ...
gflows finish feature                    # merge into dev
gflows finish feature --push              # merge and push dev
gflows finish feature --push -D           # merge, push, and delete local branch
```

**3. Release** (dev → main, then tag):

```bash
gflows bump up minor                      # e.g. 1.2.3 → 1.3.0
gflows start release v1.3.0
# ... update CHANGELOG, commit ...
gflows finish release --push              # merge to main, then dev; tag v1.3.0; push
```

**4. Hotfix** (main → fix → main + dev):

```bash
gflows start hotfix v1.3.1
# ... fix, commit ...
gflows finish hotfix --push               # merge to main, then dev; tag v1.3.1; push
```

---

## Command reference

### Summary table

| Command      | Short | Description |
|-------------|-------|--------------|
| `init`      | `-I`  | Ensure main exists; create dev from main. |
| `start`     | `-S`  | Create a workflow branch (requires type + name). |
| `finish`    | `-F`  | Merge branch into target(s), optional tag (release/hotfix), delete, push. |
| `switch`    | `-W`  | Switch to a workflow branch (picker or name). |
| `delete`   | `-L`  | Delete local workflow branch(es). Never main/dev. |
| `list`     | `-l`  | List workflow branches; optional type filter and remote. |
| `bump`     | —     | Bump or rollback package version (patch/minor/major). |
| `completion` | —   | Print shell completion script (bash \| zsh \| fish). |
| `status`   | `-t`  | Show current branch, type, base, merge target(s), ahead/behind. |
| `help`     | `-h`  | Show usage and quick reference. |
| `version`  | `-V`  | Show version. |

**Branch types (for start/finish/list):** `feature` (`-f`), `bugfix` (`-b`), `chore` (`-c`), `release` (`-r`), `hotfix` (`-x`), `spike` (`-e`).

---

### init

Ensures the **main** branch exists (exits with error if not). Creates **dev** from main if it does not exist; does nothing if dev already exists. Does not rewrite or force-push.

**Examples:**

```bash
gflows init
gflows init --push              # push dev to remote after creating
gflows init -C ../other-repo    # run in another directory
gflows init --dry-run           # log intended actions only
```

**Flags:** `--push`, `-C`/`--path <dir>`, `--dry-run`, `-v`/`--verbose`, `-q`/`--quiet`.

---

### start

Creates a new workflow branch from the correct base. **Requires** type and name (e.g. `start feature my-feat`). For **release** and **hotfix**, the name must be a version: `vX.Y.Z` or `X.Y.Z` (e.g. `v1.2.0`).

**Pre-checks:** Repository is Git; not detached HEAD; no rebase/merge in progress; working tree clean (unless `--force`); base branch exists (local or after fetch).

**Examples:**

```bash
gflows start feature auth-refactor
gflows start -f auth-refactor                    # same (short type)
gflows start bugfix fix-login --from main        # bugfix from main instead of dev
gflows start release v2.0.0
gflows start hotfix 1.2.1                        # "v" is optional for version
gflows start feature wip --force                 # allow uncommitted changes
gflows start feature api-v2 --push               # create branch and push to remote
gflows start chore deps-update -C ./backend      # run in subdirectory
```

**Flags:** `--force` (allow dirty working tree), `--push`, `-o`/`--from <branch>` (base override, e.g. `-o main` for bugfix), `-R`/`--remote`, `-C`/`--path`, `--dry-run`, `-v`, `-q`.

---

### finish

Merges the current workflow branch (or the one given with `-B`) into its merge target(s). For **release** and **hotfix**, merges into main first, then merges main into dev and creates a tag. Uses normal merge; use `--no-ff` to always create a merge commit. On **merge conflict**, gflows exits with a clear message and does not complete the merge—you resolve conflicts manually, then run `git merge --continue` or re-run `gflows finish` as needed.

**Pre-checks:** Not detached HEAD; no rebase/merge in progress; current branch (or `-B` target) is not main or dev; for release/hotfix, tag does not already exist.

**Examples:**

```bash
gflows finish feature                      # merge current branch (feature/xyz) into dev
gflows finish feature -B feature/auth      # finish branch feature/auth
gflows finish feature --no-ff              # always create a merge commit
gflows finish feature --push -D            # merge, push, delete local branch
gflows finish release --push               # merge to main, then dev; tag; push
gflows finish hotfix -s                    # sign the tag (GPG)
gflows finish hotfix -T                    # no tag (e.g. abandon hotfix as release)
gflows finish -y                           # skip "Delete branch after finish?" prompt (use default)
```

**Branch resolution:** If you omit the branch name, gflows uses the current branch. With `-B` and no value in a TTY, it shows a picker of workflow branches. Without a TTY, you must pass the branch name explicitly.

**Flags:** `-B`/`--branch <name>`, `--no-ff`, `-D`/`--delete` (delete branch after finish), `-N`/`--no-delete`, `--push`, `-s`/`--sign`, `-T`/`--no-tag`, `-M`/`--tag-message`, `-m`/`--message`, `-y`/`--yes`, `-C`, `--dry-run`, `-v`, `-q`.

---

### switch

Switches to a workflow branch. With a **TTY** and no branch name, shows an interactive **picker** of local workflow branches. Otherwise you must pass the branch name as a positional.

**Examples:**

```bash
gflows switch                      # picker (if TTY)
gflows switch feature/auth-refactor
gflows -W feature/auth-refactor    # same with short command
```

**Flags:** `-C`/`--path`, `-v`, `-q`.

---

### delete

Deletes **local** workflow branch(es). Never deletes the configured main or dev. With a **TTY** and no names, shows a picker (or multi-select if supported). Otherwise pass one or more branch names as positionals.

**Examples:**

```bash
gflows delete                           # picker (if TTY)
gflows delete feature/old-spike
gflows delete feature/one feature/two    # delete multiple
```

**Flags:** `-C`/`--path`, `-v`, `-q`.

---

### list

Lists workflow branches (those matching configured prefixes). Output is **one branch per line** to stdout for scripting. Optionally filter by type; optionally include remote-tracking branches (with `-r`/`--include-remote`, which may run `git fetch` first).

**Examples:**

```bash
gflows list                              # all local workflow branches
gflows list feature                      # only feature/* branches
gflows list -r                           # include remote-tracking branches
gflows list -r feature                   # remote + local feature branches
gflows list --include-remote
```

**Flags:** `-r`/`--include-remote`, `-C`/`--path`, `--dry-run`, `-v`, `-q`.

---

### bump

Bumps or rolls back the **root** package version (reads `package.json` from cwd or `-C`). Keeps `package.json` and `jsr.json` in sync; **no git operations** (no commit or tag). Useful before `gflows start release vX.Y.Z`.

**Positionals:** direction `up` | `down`, type `patch` | `minor` | `major`. When both are omitted and stdin is a TTY, shows interactive selects. When not a TTY, both are required.

**Examples:**

```bash
gflows bump up patch                     # 1.2.3 → 1.2.4
gflows bump up minor                     # 1.2.3 → 1.3.0
gflows bump up major                     # 1.2.3 → 2.0.0
gflows bump down patch                   # 1.2.4 → 1.2.3 (floor at 0)
gflows bump down minor                   # 1.3.0 → 1.2.0
gflows bump                              # interactive (direction + type) when TTY
gflows bump --dry-run                    # print old → new, no file writes
```

**Flags:** `--dry-run`, `-C`/`--path`, `-v`, `-q`.

---

### status

Shows current branch, its **classification** (feature, bugfix, chore, release, hotfix, spike, main, dev, or unknown), **base** branch, **merge target(s)**, and **ahead/behind** vs base. No write operations; safe to run anytime.

**Examples:**

```bash
gflows status
gflows -t
```

**Flags:** `-C`/`--path`, `-v`, `-q`.

---

### completion

Prints the shell completion script. Use with `source` (bash/zsh) or pipe into your shell (fish) to enable tab-completion for commands, types, and branch names.

**Examples:** See [Shell completion](#shell-completion).

---

### help & version

```bash
gflows help
gflows -h
gflows version
gflows -V
```

---

## Branch types in detail

| Type     | Short | Base (default)   | With `-o main` | Merge target(s)       | Tag   |
|----------|-------|------------------|-----------------|------------------------|-------|
| feature  | `-f`  | dev              | —               | dev                    | no    |
| bugfix   | `-b`  | dev              | main            | dev (or main if from main) | no |
| chore    | `-c`  | dev              | —               | dev                    | no    |
| release  | `-r`  | dev              | —               | main, then dev         | yes   |
| hotfix   | `-x`  | main             | —               | main, then dev         | yes   |
| spike    | `-e`  | dev              | —               | dev                    | no    |

- **feature** — New functionality; branches from dev, merges to dev.
- **bugfix** — Bug fixes. Usually from dev → dev. Use `-o main` when fixing a bug on production (branch from main, merge to main then dev).
- **chore** — Tasks that don’t change behavior (deps, tooling, docs). dev → dev.
- **release** — Prepare a release from dev: merge to main, then merge main into dev, create tag (e.g. `v1.2.0`). Name must be a version: `vX.Y.Z` or `X.Y.Z`.
- **hotfix** — Urgent fix from production (main). Merge to main, then main into dev; tag. Name must be a version.
- **spike** — Short-lived experiment; dev → dev, no tag. Discard or merge as needed.

**Naming:** Branch names use prefixes by default: `feature/add-login`, `bugfix/fix-login`, `release/v1.0.0`, `hotfix/v1.0.1`, `chore/update-deps`, `spike/try-cache`. Prefixes can be overridden in [configuration](#configuration). Invalid branch names (e.g. containing `..`, `*`, spaces) are rejected with exit code 1.

---

## Configuration

Configuration is **optional**. Override branch names, remote, and branch **prefixes** when needed.

**Resolution order** (later overrides earlier):

1. Built-in defaults (`main`, `dev`, `origin`, and default prefixes).
2. Repo config file: **`.gflows.json`** in repo root, or **`gflows`** key in **`package.json`**.
3. Environment: **`GFLOWS_MAIN`**, **`GFLOWS_DEV`**, **`GFLOWS_REMOTE`**.
4. CLI (e.g. `-R`/`--remote` for push).

Only include keys you want to override; the rest stay default. Invalid or malformed config is ignored (with an optional warning when using `-v`).

### Example: `.gflows.json` (full)

```json
{
  "main": "main",
  "dev": "dev",
  "remote": "origin",
  "prefixes": {
    "feature": "feature/",
    "bugfix": "bugfix/",
    "chore": "chore/",
    "release": "release/",
    "hotfix": "hotfix/",
    "spike": "spike/"
  }
}
```

### Example: minimal override (different branch names)

```json
{
  "main": "master",
  "dev": "develop"
}
```

### Example: custom prefixes only

```json
{
  "prefixes": {
    "feature": "feat/",
    "bugfix": "fix/"
  }
}
```

### Example: `package.json` key

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "gflows": {
    "main": "main",
    "dev": "development",
    "remote": "upstream"
  }
}
```

### Environment variables

```bash
export GFLOWS_MAIN=main
export GFLOWS_DEV=develop
export GFLOWS_REMOTE=origin
gflows init
```

---

## Scripting and CI

- **Non-interactive:** When stdin is **not** a TTY, gflows does **not** show pickers (e.g. for switch, delete, or finish `-B`). You must pass branch names explicitly or the command exits with a clear message (exit code 1).
- **Skip confirmations:** Use **`-y`/`--yes`** to accept defaults (e.g. "Delete branch after finish?" → no delete unless you also passed `-D`).
- **Exit codes:** Use them in scripts: `0` success, `1` usage/validation, `2` Git/system error.

**Examples:**

```bash
# Require explicit branch when not TTY
gflows finish feature -B feature/add-login --push -y

# List branches for parsing (one per line)
gflows list feature | while read -r b; do echo "Branch: $b"; done

# CI: fail fast on error
set -e
gflows start feature ci-job --force
# ... run tests ...
gflows finish feature -B feature/ci-job -y
```

**Path:** Use `-C`/`--path` so all git and config resolution use that directory:

```bash
gflows -C /var/lib/repos/my-app status
gflows -C ./packages/api list
```

---

## Exit codes

| Code | Meaning | Typical causes |
|------|---------|-----------------|
| **0** | Success | Command completed without error. |
| **1** | Usage / validation | Missing type or name for `start`; invalid branch name or version format; wrong/missing positionals for non-TTY. |
| **2** | Git / system | Not a Git repo; branch not found; dirty working tree (start without `--force`); merge conflict on finish; rebase/merge in progress; detached HEAD; finish on main/dev; tag already exists; push failed after merge. |

**Validation (exit 1):** Invalid version (e.g. `start release foo`), invalid branch name (e.g. `feature/bad..name`), or missing required args in non-interactive mode.

**Git/state (exit 2):** Repository issues, branch missing, merge conflicts (user must resolve manually), or guards (e.g. cannot finish main/dev, cannot delete main/dev).

---

## Troubleshooting

| Situation | What to do |
|-----------|------------|
| **"Not a Git repository"** | Run from a directory that contains `.git`, or use `-C <path>` to point to the repo root. |
| **"Working tree has uncommitted changes"** | Commit or stash changes before `start`, or use `--force` (only when you intend to carry uncommitted work). |
| **"Merge conflict while merging into …"** | Resolve conflicts in your working tree, then run `git add` and `git merge --continue` (or `git merge --abort` to cancel). Re-run `gflows finish` after resolving if needed. |
| **"Tag v1.2.3 already exists"** | Use a new version for the release/hotfix, or delete/move the tag if you know what you’re doing. gflows does not overwrite tags. |
| **"Cannot finish the long-lived branch main/dev"** | You’re on main or dev. Checkout a workflow branch first, or use `-B <branch>` to finish another branch. |
| **"HEAD is detached"** | Checkout a branch (e.g. `git checkout dev`) before running `start` or `finish`. |
| **"A rebase or merge is in progress"** | Run `git rebase --abort` or `git merge --abort`, or complete the operation, then retry gflows. |
| **Picker not showing / "requires branch name"** | Without a TTY, gflows does not show interactive pickers. Pass the branch name explicitly (e.g. `-B feature/xyz` or `gflows switch feature/xyz`). |
| **Wrong remote or branch names** | Set `GFLOWS_MAIN`, `GFLOWS_DEV`, `GFLOWS_REMOTE` or use `.gflows.json` / `package.json` "gflows" key. Use `-R` for one-off remote override. |

Use **`-v`/`--verbose`** to see git commands and extra diagnostics; combine with the error message to pinpoint the cause.

---

## Shell completion

Generate and install completion so you can tab-complete commands, types, and (where applicable) branch names.

**Bash:**

```bash
source <(gflows completion bash)
# Or persist:
echo 'source <(gflows completion bash)' >> ~/.bashrc
```

**Zsh:**

```bash
source <(gflows completion zsh)
# Or persist:
echo 'source <(gflows completion zsh)' >> ~/.zshrc
```

**Fish:**

```bash
gflows completion fish | source
# Or persist:
gflows completion fish > ~/.config/fish/completions/gflows.fish
```

Completion covers: **commands** (init, start, finish, switch, delete, list, bump, completion, status, help, version), **types** (feature, bugfix, chore, release, hotfix, spike), and **branch names** from local workflow branches when the context expects a branch (e.g. after `switch` or `finish -B`).

---

## Publishing (maintainers)

Publishing is done with the **internal script** `scripts/publish.ts`. It syncs the version from **package.json** to **jsr.json**, then publishes to **npm** and/or **JSR**. The script is not part of the published package (`files` excludes `scripts/`).

### Commands

```bash
bun run publish:all              # publish to npm and JSR (same version)
bun run publish:all -- --dry-run # sync version only; print intended commands; no publish
bun run publish:npm              # publish only to npm
bun run publish:jsr              # publish only to JSR
bun run publish:all -- --force   # skip pre-publish checks (clean tree, branch main)
```

### Typical release workflow

1. Ensure you’re on **main** with a clean working tree (or use `--force` when intentional).
2. Bump version and tag in Git yourself, or use gflows bump + your own commit:
   ```bash
   gflows bump up minor --dry-run   # confirm
   gflows bump up minor
   git add package.json jsr.json && git commit -m "chore: bump to 1.4.0"
   ```
3. Run the publish script:
   ```bash
   bun run publish:all -- --dry-run # verify
   bun run publish:all
   ```
4. Optionally push main and tags:
   ```bash
   git push origin main --tags
   ```

**Version sync:** The script reads `version` from **package.json** and writes it to **jsr.json** before publishing so the two registries never drift. Use **`gflows bump`** to change the version; the script does not bump for you.

---

## License

See [LICENSE](LICENSE) in this repository.
