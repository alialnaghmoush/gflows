# gflows

[![npm](https://img.shields.io/npm/v/gflows.svg)](https://www.npmjs.com/package/gflows)
[![JSR](https://jsr.io/badges/@alialnaghmoush/gflows)](https://jsr.io/@alialnaghmoush/gflows)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-fbf0df?logo=bun&logoColor=black)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ink](https://img.shields.io/badge/UI-Ink-E88C4A)](https://term.ink)

**Git branching that stays simple.**  
Long-lived `main` + `dev`, short-lived typed branches, clear merge targets — as a Bun/TypeScript CLI.


| You want…             | Do this                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| Just pick from a menu | `gflows` or `g` → [hub](#three-ways-to-run-gflows)                     |
| Type commands         | [5-minute path](#5-minute-path) · [cheat sheet](#command-cheat-sheet)  |
| Agents / CI           | [AGENTS.md](AGENTS.md) · `gflows schema` · [Scripting](#scripting--ci) |


---



## Three ways to run gflows


| Way                  | When                 | Example                                                        |
| -------------------- | -------------------- | -------------------------------------------------------------- |
| **1. Hub (select)**  | Daily, in a terminal | `gflows` / `g` → select or `/start` — wizards stay in Ink |
| **2. Long commands** | Scripts, clarity     | `gflows start feature payments`                                |
| **3. Short flags**   | Fast typing          | `g -S -f payments`                                             |




### Way 1 — Hub (recommended for humans)

```bash
# optional, once — put in ~/.zshrc or ~/.bashrc
alias g=gflows
# or if gflows is only a project dependency:
alias g='bunx gflows'
```

Then:

```bash
g          # or: gflows
```

You get a fullscreen menu: what’s next, branch map, actions. **Select** an item (or type `/start`, `/finish`, `/release`, `/sync`, …). Follow-up questions (type, name, push, rebase) stay **inside the Ink UI** — no drop-out to a separate prompt tool. Only the git command itself runs on the main screen, then you press enter to return.

```
❯ ★ Start new work
  Sync with base
  Open pull request
  Finish / merge branch
  …
```



### Way 2 & 3 — Type it yourself

Same job, no menu (`alias g=gflows`):

| Long | Short |
|------|-------|
| `gflows start feature payments` | `g -S -f payments` |
| `gflows finish feature -y -P` | `g -F -f -y -P` |

CI and agents should always use **typed** commands (never the hub). See [Scripting & CI](#scripting--ci).

---



## Why gflows?

Most teams reinvent the same rules: features go to `dev`, releases hit `main`, hotfixes sync back. gflows encodes that so you stop typing fragile git-flow by hand.

- **Safe defaults** — no history rewrite; finish refuses empty/dirty work; delete-after-finish is on (opt out with `-N`)
- **Human + machine** — Ink hub in a TTY; explicit flags in CI; JSON + MCP for agents
- **Recoverable** — `continue` / `abort` / `undo` after conflicts

---



## Install

**Needs:** [Bun](https://bun.sh) ≥ 1.0 and Git.

```bash
# project (recommended)
bun add --dev gflows

# or global
bun add --global gflows

# npm / npx also work
npm install --save-dev gflows
```

**JSR:** `[@alialnaghmoush/gflows](https://jsr.io/@alialnaghmoush/gflows)`

```bash
bunx gflows version   # sanity check
```

---



## Mental model (2 minutes)

```
main  ←  release / hotfix only          (production)
 │
 └──→  dev  ←  feature / bugfix / chore / spike   (integration)
              ↑
         short-lived workflow branches
```


| Branch                               | Role                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| **main**                             | Production                                                  |
| **dev**                              | Integration (created by `init` from main)                   |
| **feature / bugfix / chore / spike** | Day-to-day work → merge to **dev**                          |
| **release / hotfix**                 | Versioned (`vX.Y.Z`) → **main**, then **main → dev**, + tag |
| **quick release** (`gflows release`) | From **dev** only: bump → **main** → tag → sync **dev**     |


**Lifecycle:** `init` → `start` → commit → (`sync`) → (`pr`) → `finish`

---



## 5-minute path



### 1. Set up the repo (once)

```bash
cd your-repo          # must already be a git repo with main
# Hub: g  →  select “Initialize repo”
```

| Long | Short |
|------|-------|
| `gflows init` | `g -I` |
| `gflows init --no-push -y --script-alias g` | `g -I -P -y --script-alias g` |

Creates `dev` from `main`. Optional: `--main`, `--dev`, `--remote` → writes `.gflows.json`.  
`--script-alias g` adds `"g": "gflows"` to `package.json` (then `bun run g -- …` — note the `--`).

### 2. Ship a feature

**Easiest — hub (select + prompts):**

```bash
g                 # or gflows
# select ★ Start new work  → answer type / name / push?
# … edit, git commit …
g                 # select Sync / Open PR / Finish when ready
```

**Or type it** (`alias g=gflows`):

| Long | Short |
|------|-------|
| `gflows start feature add-login` | `g -S -f add-login` |
| `gflows finish feature -y -P` | `g -F -f -y -P` |

Optional: `gflows sync --force` · `gflows pr`  
Finish **deletes** the branch by default (`-N` to keep). Use `-p` instead of `-P` to push.

```bash
gflows viz    # branch map in the scrollback (no fullscreen menu)
```

---



## Everyday recipes

Hub: `g` → select the action. Typed short form assumes `alias g=gflows`.

**Feature → dev**


| Long                            | Short              |
| ------------------------------- | ------------------ |
| `gflows start feature payments` | `g -S -f payments` |
| `gflows finish feature -y -P`   | `g -F -f -y -P`    |




**Production bugfix (from main)** — merges **main**, then **main → dev**

| Long | Short |
|------|-------|
| `gflows start bugfix login-crash -o main` | `g -S -b login-crash -o main` |
| `gflows finish bugfix -y -p` | `g -F -b -y -p` |

**Release** — tag on finish; merges **main**, then **main → dev**

| Long | Short |
|------|-------|
| `gflows bump up minor` | `g -U up minor` |
| `gflows start release v1.4.0` | `g -S -r v1.4.0` |
| `gflows finish release -y -p` | `g -F -r -y -p` |

**Quick release from `dev`** — bump, merge **main**, tag, sync **main → dev** (no `release/*` branch)

| Long | Short |
|------|-------|
| `gflows release up patch -y -p` | — |

**Hotfix**

| Long | Short |
|------|-------|
| `gflows start hotfix v1.4.1` | `g -S -x v1.4.1` |
| `gflows finish hotfix -y -p` | `g -F -x -y -p` |

**Stuck after a conflict** — fix files and `git add` before `continue`

| Long | Short |
|------|-------|
| `gflows continue` | — |
| `gflows abort` | — |
| `gflows undo` | — |
| `gflows doctor` | — |
| `gflows info` | — |



---



## Hub controls

Bare `gflows` / `g` in a **TTY** opens the Ink hub (see [Way 1](#way-1--hub-recommended-for-humans)).


| Input                                      | Action                                 |
| ------------------------------------------ | -------------------------------------- |
| ↑↓ Enter                                   | Select an action — Ink wizard if needed |
| `/start` `/finish` `/release` `/sync` …    | Slash command; wizards stay in the hub |
| `?`                                        | Shortcut help                          |
| `q` / Esc / Ctrl+C                         | Quit                                   |


**Non-TTY never opens the hub** — pass full args (CI/agents).

---



## Command cheat sheet


| Command                       | What it does                                |
| ----------------------------- | ------------------------------------------- |
| *(bare)*                      | Fullscreen hub (TTY only)                   |
| `init` `-I`                   | Ensure main; create dev                     |
| `start` `-S`                  | Create typed branch                         |
| `finish` `-F`                 | Merge + close (plan; delete default **on**) |
| `release`                     | Quick release from `dev` (bump + main + tag)|
| `sync`                        | Update branch from its base                 |
| `pr`                          | Open PR/MR (`gh` / `glab`)                  |
| `switch` `-W`                 | Switch branch                               |
| `delete` `-L`                 | Delete local workflow branch(es)            |
| `list` `-l`                   | List workflow branches                      |
| `status` `-t`                 | Current branch flow info                    |
| `viz`                         | Scrollback visual map                       |
| `doctor`                      | Health checks                               |
| `info`                        | Layout, versions, frontend/backend stacks   |
| `config`                      | `get` / `set` `.gflows.json`                |
| `bump` `-U`                   | Version bump/rollback in package files      |
| `continue` / `abort` / `undo` | Recovery                                    |
| `schema` / `mcp`              | Agents & tooling                            |
| `completion`                  | bash / zsh / fish                           |
| `help` `-h` · `version` `-V`  | Meta                                        |




### Short form (flags)

With `alias g=gflows`, replace the words with flags:

| Long | Short |
|------|-------|
| `init` | `-I` |
| `start` | `-S` |
| `finish` | `-F` |
| `switch` | `-W` |
| `delete` | `-L` |
| `list` | `-l` |
| `status` | `-t` |
| `bump` | `-U` |
| `feature` | `-f` |
| `bugfix` | `-b` |
| `chore` | `-c` |
| `release` | `-r` |
| `hotfix` | `-x` |
| `spike` | `-e` |

| Long | Short |
|------|-------|
| `gflows start feature payments` | `g -S -f payments` |
| `gflows finish feature -y -P` | `g -F -f -y -P` |
| `gflows start bugfix x -o main` | `g -S -b x -o main` |
| `gflows start release v1.4.0` | `g -S -r v1.4.0` |
| `gflows start hotfix v1.4.1` | `g -S -x v1.4.1` |
| `gflows init -y -P` | `g -I -y -P` |
| `gflows bump up minor` | `g -U up minor` |
| `gflows bump down patch` | `g -U down patch` |

### Flags you’ll use most

| Long | Short |
|------|-------|
| `--yes` | `-y` |
| `--push` | `-p` |
| `--no-push` | `-P` |
| `--no-delete` | `-N` |
| `--delete` | `-D` |
| `--from <branch>` | `-o <branch>` |
| `--branch <name>` | `-B <name>` |
| `--dry-run` | `-d` |
| `--path <dir>` | `-C <dir>` |

Also: `--json` · `--rebase` · `--squash` · `--preview` · `--bump`  
Full list: `gflows help`.

### Finish in one glance

| Long | Short |
|------|-------|
| `gflows finish feature -y -P` | `g -F -f -y -P` |
| `gflows finish feature -y -p` | `g -F -f -y -p` |
| `gflows finish feature -y -P -N` | `g -F -f -y -P -N` |
| `gflows finish feature --preview` | — |

`-P` = no push · `-p` = push · `-N` = keep branch  
Non-interactive finish **must** include `-p` or `-P`. Empty branch → exit `2`.

---



## Configuration

Optional `.gflows.json` in the repo root (written by `init` when you pass names, or `gflows config set`):

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

```bash
gflows config get main
gflows config set dev develop
```

CLI `--main` / `--dev` / `-R` override for a single run.

---



## Scripting & CI

Rules of thumb:

1. Always pass a **command** (no bare hub).
2. Finish: `-y` and `-p` **or** `-P`.
3. Prefer `--json` for parsers; hints go to **stderr**.

| Long | Short |
|------|-------|
| `gflows init --no-push -y` | `g -I -P -y` |
| `gflows start feature ci-check` | `g -S -f ci-check` |
| `gflows finish feature -y -P` | `g -F -f -y -P` |
| `gflows status --json` | `g -t --json` |
| `gflows doctor --json` | — |
| `gflows info --json` | — |

**Exit codes:** `0` ok · `1` usage/validation · `2` git/system (conflict, dirty tree, empty finish, …)

**Agents:** [AGENTS.md](AGENTS.md) · `gflows schema` · `gflows mcp`

---



## Troubleshooting


| Symptom                | Fix                                                    |
| ---------------------- | ------------------------------------------------------ |
| Hub / pickers missing  | Not a TTY — pass branch names and flags explicitly     |
| Finish wants push flag | Add `-p` or `-P`                                       |
| “Nothing to finish”    | Commit on the branch first (ahead of base must be > 0) |
| Merge conflict         | Fix → `git add` → `gflows continue`                    |
| Tag already exists     | Bump the version; gflows won’t overwrite tags          |
| Can’t finish main/dev  | Finish a **workflow** branch (`-B feature/…`)          |
| Detached HEAD          | `git checkout dev` (or another branch) first           |
| Wrong base for bugfix  | `gflows start bugfix name -o main`                     |


```bash
gflows doctor
gflows viz
```

---



## Shell completion

```bash
# bash
eval "$(gflows completion bash)"

# zsh
eval "$(gflows completion zsh)"

# fish
gflows completion fish | source
```

---



## Publishing (maintainers)

CI: `[.github/workflows/publish.yml](.github/workflows/publish.yml)` — test, lint, publish npm + JSR on `main`.

```bash
bun run publish:all    # or publish:npm / publish:jsr
```

Link the JSR package to this GitHub repo for provenance; set `NPM_TOKEN` in Actions secrets.

---



## License

[MIT](LICENSE) · [Ali AlNaghmoush](https://github.com/alialnaghmoush) · [github.com/alialnaghmoush/gflows](https://github.com/alialnaghmoush/gflows)

Changelog: [CHANGELOG.md](CHANGELOG.md)