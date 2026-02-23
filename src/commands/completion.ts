/**
 * Completion command: print shell completion script for bash, zsh, or fish.
 * Supports completion for commands, types (feature, bugfix, etc.), and when
 * applicable branch names from local workflow branches (switch, delete, finish -B).
 * @module commands/completion
 */

import type { ParsedArgs } from "../types.js";
import { EXIT_USER } from "../constants.js";

const COMMANDS = [
  "init",
  "start",
  "finish",
  "switch",
  "delete",
  "list",
  "bump",
  "completion",
  "status",
  "help",
  "version",
];

const BRANCH_TYPES = [
  "feature",
  "bugfix",
  "chore",
  "release",
  "hotfix",
  "spike",
];

const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;

const BUMP_DIRECTIONS = ["up", "down"];
const BUMP_TYPES = ["patch", "minor", "major"];

/** Literal "${" for embedding in shell scripts (avoids template interpolation). */
const D = "${";

function bashScript(): string {
  return `# Bash completion for gflows
# Install: source <(gflows completion bash)   (add to .bashrc) or copy to /etc/bash_completion.d/

_gflows() {
  local cur prev words cword cmd_idx cmd
  words=(${D}COMP_WORDS[@]})
  cword=\$COMP_CWORD
  cur="${D}words[cword]:-}"
  prev="${D}words[cword-1]:-}"

  # Find command index (first positional; skip -C/--path and its value)
  cmd_idx=1
  while (( cmd_idx < cword )); do
    if [[ "${D}words[cmd_idx]}" == "-C" ]] || [[ "${D}words[cmd_idx]}" == "--path" ]]; then
      (( cmd_idx += 2 ))
    elif [[ "${D}words[cmd_idx]}" == -* ]]; then
      (( cmd_idx++ ))
    else
      break
    fi
  done
  cmd="${D}words[cmd_idx]:-}"

  # Resolve -C/--path for gflows list (branch names)
  _gflows_path() {
    local i path=""
    for ((i=1; i<cword; i++)); do
      if [[ "${D}words[i]}" == "-C" ]] || [[ "${D}words[i]}" == "--path" ]]; then
        if ((i+1 < cword)); then path="${D}words[i+1]}"; fi
        break
      fi
    done
    if [[ -n "\$path" ]]; then
      gflows -C "\$path" list 2>/dev/null
    else
      gflows list 2>/dev/null
    fi
  }

  # Completing -C/--path value: suggest directories
  if [[ "\$prev" == "-C" ]] || [[ "\$prev" == "--path" ]]; then
    compopt -o dirnames 2>/dev/null
    COMPREPLY=($(compgen -d -S / -- "\$cur"))
    return
  fi

  # First positional: command
  if (( cword == cmd_idx )); then
    COMPREPLY=($(compgen -W "${COMMANDS.join(" ")}" -- "\$cur"))
    return
  fi

  # After command: type/name/branches/shell/bump by command
  case "$cmd" in
    completion)
      COMPREPLY=($(compgen -W "${COMPLETION_SHELLS.join(" ")}" -- "\$cur"))
      ;;
    start)
      if (( cword == cmd_idx + 1 )); then
        COMPREPLY=($(compgen -W "${BRANCH_TYPES.join(" ")}" -- "\$cur"))
      else
        COMPREPLY=()
      fi
      ;;
    finish)
      if [[ "\$prev" == "-B" ]] || [[ "\$prev" == "--branch" ]]; then
        COMPREPLY=($(compgen -W "$(_gflows_path)" -- "\$cur"))
      elif (( cword == cmd_idx + 1 )); then
        COMPREPLY=($(compgen -W "${BRANCH_TYPES.join(" ")}" -- "\$cur"))
      else
        COMPREPLY=()
      fi
      ;;
    list)
      COMPREPLY=($(compgen -W "${BRANCH_TYPES.join(" ")}" -- "\$cur"))
      ;;
    switch|delete)
      COMPREPLY=($(compgen -W "$(_gflows_path)" -- "\$cur"))
      ;;
    bump)
      if (( cword == cmd_idx + 1 )); then
        COMPREPLY=($(compgen -W "${BUMP_DIRECTIONS.join(" ")}" -- "\$cur"))
      elif (( cword == cmd_idx + 2 )); then
        COMPREPLY=($(compgen -W "${BUMP_TYPES.join(" ")}" -- "\$cur"))
      else
        COMPREPLY=()
      fi
      ;;
    *)
      COMPREPLY=()
      ;;
  esac
}

complete -F _gflows gflows 2>/dev/null || complete -o bashdefault -o default -F _gflows gflows
`;
}

function zshScript(): string {
  return `# Zsh completion for gflows
# Install: source <(gflows completion zsh)   (add to .zshrc) or save to ${D}fpath[1]}/_gflows

_gflows_list_branches() {
  local -a path
  local i=1
  while (( i < CURRENT )); do
    if [[ "${D}words[i]}" == "-C" ]] || [[ "${D}words[i]}" == "--path" ]]; then
      (( i+1 < CURRENT )) && path=(-C "${D}words[i+1]}")
      break
    fi
    (( i++ ))
  done
  (( ${D}#path[@]} > 0 )) && gflows "${D}path[@]}" list 2>/dev/null || gflows list 2>/dev/null
}

_gflows() {
  local cur context state line cmd cmd_idx i
  _arguments -C -s -S \\
    '-C+[run as if in dir]:dir:_files -/' \\
    '--path=+[run as if in dir]:dir:_files -/' \\
    '-h[show help]' \\
    '--help[show help]' \\
    '-V[show version]' \\
    '--version[show version]' \\
    '1:command:(${COMMANDS.join(" ")})' \\
    '*::args:->args'

  case $state in
    args)
      cur=\$words[CURRENT]
      cmd_idx=1
      while (( cmd_idx < CURRENT )); do
        if [[ "${D}words[cmd_idx]}" == "-C" ]] || [[ "${D}words[cmd_idx]}" == "--path" ]]; then
          (( cmd_idx += 2 ))
        elif [[ "${D}words[cmd_idx]}" == -* ]]; then
          (( cmd_idx++ ))
        else
          cmd="${D}words[cmd_idx]}"
          break
        fi
      done
      case "$cmd" in
        completion)
          _values "shell" ${COMPLETION_SHELLS.map((s) => `"${s}"`).join(" ")}
          ;;
        start)
          _values "type" ${BRANCH_TYPES.map((t) => `"${t}"`).join(" ")}
          ;;
        finish)
          if [[ "${D}words[CURRENT-1]}" == "-B" ]] || [[ "${D}words[CURRENT-1]}" == "--branch" ]]; then
            _values "branch" \$(_gflows_list_branches)
          else
            _values "type" ${BRANCH_TYPES.map((t) => `"${t}"`).join(" ")}
          fi
          ;;
        list)
          _values "type" ${BRANCH_TYPES.map((t) => `"${t}"`).join(" ")}
          ;;
        switch|delete)
          _values "branch" \$(_gflows_list_branches)
          ;;
        bump)
          if [[ "${D}words[CURRENT-1]}" == "up" ]] || [[ "${D}words[CURRENT-1]}" == "down" ]]; then
            _values "bump-type" ${BUMP_TYPES.map((t) => `"${t}"`).join(" ")}
          else
            _values "direction" ${BUMP_DIRECTIONS.map((d) => `"${d}"`).join(" ")}
          fi
          ;;
      esac
      ;;
  esac
}

_gflows
`;
}

function fishScript(): string {
  return `# Fish completion for gflows
# Install: gflows completion fish | source   (add to ~/.config/fish/config.fish) or save to ~/.config/fish/completions/gflows.fish

function __gflows_path
  set -l tokens (commandline -opc)
  set -l i 1
  while test $i -le (count $tokens)
    if test "$tokens[$i]" = "-C"; and test (math $i + 1) -le (count $tokens)
      echo $tokens[(math $i + 1)]
      return
    end
    set i (math $i + 1)
  end
end

function __gflows_list_branches
  set -l path (__gflows_path)
  if test -n "$path"
    gflows -C "$path" list 2>/dev/null
  else
    gflows list 2>/dev/null
  end
end

# Commands
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "init" -d "Ensure main, create dev"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "start" -d "Create workflow branch"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "finish" -d "Merge and close branch"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "switch" -d "Switch branch"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "delete" -d "Delete local branch(es)"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "list" -d "List branches by type"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "bump" -d "Bump or rollback version"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "completion" -d "Print shell completion script"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "status" -d "Show current branch flow info"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "help" -d "Show usage"
complete -c gflows -f -n "not __fish_seen_subcommand_from ${COMMANDS.join(" ")}" \\
  -a "version" -d "Show version"

# completion <shell>
complete -c gflows -f -n "__fish_seen_subcommand_from completion" -a "bash" -d "Bash completion script"
complete -c gflows -f -n "__fish_seen_subcommand_from completion" -a "zsh" -d "Zsh completion script"
complete -c gflows -f -n "__fish_seen_subcommand_from completion" -a "fish" -d "Fish completion script"

# start <type>
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "feature" -d "Feature branch"
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "bugfix" -d "Bugfix branch"
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "chore" -d "Chore branch"
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "release" -d "Release branch"
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "hotfix" -d "Hotfix branch"
complete -c gflows -f -n "__fish_seen_subcommand_from start; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}" \\
  -a "spike" -d "Spike/experiment branch"

# finish <type> or -B <branch>
complete -c gflows -f -n "__fish_seen_subcommand_from finish; and not __fish_seen_subcommand_from ${BRANCH_TYPES.join(" ")}; and not __fish_prev_arg -x -l branch -s B" \\
  -a "feature bugfix chore release hotfix spike"
complete -c gflows -f -n "__fish_seen_subcommand_from finish; and __fish_prev_arg -x -l branch -s B" \\
  -a "(__gflows_list_branches)"

# list [type]
complete -c gflows -f -n "__fish_seen_subcommand_from list" \\
  -a "feature bugfix chore release hotfix spike"

# switch <branch>
complete -c gflows -f -n "__fish_seen_subcommand_from switch" \\
  -a "(__gflows_list_branches)"

# delete <branch>
complete -c gflows -f -n "__fish_seen_subcommand_from delete" \\
  -a "(__gflows_list_branches)"

# bump [up|down] [patch|minor|major]
complete -c gflows -f -n "__fish_seen_subcommand_from bump; and not __fish_seen_subcommand_from ${BUMP_DIRECTIONS.join(" ")}" \\
  -a "up down"
complete -c gflows -f -n "__fish_seen_subcommand_from bump; and __fish_seen_subcommand_from up down" \\
  -a "patch minor major"

# Common flags
complete -c gflows -x -n "__fish_seen_subcommand_from ${COMMANDS.join(" ")}" -l path -s C -d "Run as if in dir" -a "(__fish_complete_directories)"
complete -c gflows -f -n "__fish_seen_subcommand_from ${COMMANDS.join(" ")}" -l help -s h -d "Show help"
complete -c gflows -f -n "__fish_seen_subcommand_from ${COMMANDS.join(" ")}" -l version -s V -d "Show version"
`;
}

/**
 * Runs the completion command: prints the shell completion script for the given shell.
 * Requires one of: bash, zsh, fish. Script supports commands, types, and when applicable
 * branch names from local workflow branches (via `gflows list`).
 *
 * @param args - Parsed CLI args; args.completionShell must be "bash" | "zsh" | "fish".
 */
export async function run(args: ParsedArgs): Promise<void> {
  const shell = args.completionShell;
  if (!shell) {
    console.error(
      "gflows: completion requires a shell. Use: gflows completion bash | zsh | fish"
    );
    process.exit(EXIT_USER);
  }

  let script: string;
  switch (shell) {
    case "bash":
      script = bashScript();
      break;
    case "zsh":
      script = zshScript();
      break;
    case "fish":
      script = fishScript();
      break;
    default: {
      const _: never = shell;
      script = "";
    }
  }

  process.stdout.write(script);
}
