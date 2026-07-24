/**
 * Hub home screen — status map, actions, slash prompt (Ink).
 * @module tui/HubHome
 */

import { homedir } from "node:os";
import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentBranch, resolveRepoRoot } from "../git.js";
import { type RecommendAction, recommend } from "../recommend.js";
import { getVersion } from "../version.js";
import { collectVizSnapshot, type VizSnapshot } from "../viz.js";
import { completeSlashInput, filterSlashCommands } from "./slash.js";

const ACCENT = "#E88C4A";
const MUTED = "#8A8A8A";
const FG = "#E6E6E6";
const GREEN = "#78C88C";
const YELLOW = "#DCB450";

type ActionItem = { id: string; label: string; hint?: string };

/**
 * Props for the hub home view.
 */
export interface HubHomeProps {
  cwd: string;
  flash?: string;
  onAction: (id: string) => void;
  onSlash: (command: string) => void;
  onQuit: () => void;
}

/**
 * Main hub dashboard.
 */
export function HubHome({
  cwd,
  flash,
  onAction,
  onSlash,
  onQuit,
}: HubHomeProps): React.ReactElement {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;

  const [snap, setSnap] = useState<VizSnapshot | null>(null);
  const [branch, setBranch] = useState("—");
  const [repoPath, setRepoPath] = useState(cwd);
  const [selected, setSelected] = useState(0);
  const [input, setInput] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const version = useMemo(() => getVersion(), []);
  const slashMatches = useMemo(() => filterSlashCommands(input), [input]);
  const slashMode = input.startsWith("/");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const root = await resolveRepoRoot(cwd);
        const b = (await getCurrentBranch(root, {})) ?? "detached";
        const s = await collectVizSnapshot(cwd);
        if (!cancelled) {
          setRepoPath(root);
          setBranch(b);
          setSnap(s);
        }
      } catch {
        if (!cancelled) {
          setSnap(null);
          setBranch("—");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const rec = snap ? recommend(snap) : null;
  const actions = useMemo(() => buildActions(snap, rec?.action ?? null), [snap, rec?.action]);

  useEffect(() => {
    if (selected >= actions.length) setSelected(Math.max(0, actions.length - 1));
  }, [actions.length, selected]);

  useEffect(() => {
    if (slashIndex >= slashMatches.length) {
      setSlashIndex(Math.max(0, slashMatches.length - 1));
    }
  }, [slashMatches.length, slashIndex]);

  const setSlashInput = (next: string) => {
    setInput(next);
    setSlashIndex(0);
  };

  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      onQuit();
      return;
    }
    if (key.escape) {
      if (input || showHelp) {
        setSlashInput("");
        setShowHelp(false);
        return;
      }
      onQuit();
      return;
    }
    if (ch === "?" && input === "") {
      setShowHelp((v) => !v);
      return;
    }
    if (ch === "q" && input === "") {
      onQuit();
      return;
    }
    if (key.tab && slashMode) {
      const next = completeSlashInput(input, slashIndex);
      if (next !== null) setSlashInput(next);
      return;
    }
    if (key.upArrow) {
      if (slashMode && slashMatches.length > 0) {
        setSlashIndex((i) => Math.max(0, i - 1));
        return;
      }
      setSelected((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      if (slashMode && slashMatches.length > 0) {
        setSlashIndex((i) => Math.min(slashMatches.length - 1, i + 1));
        return;
      }
      setSelected((i) => Math.min(actions.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setSlashInput([...input].slice(0, -1).join(""));
      return;
    }
    if (key.return) {
      const cmd = input.trim();
      if (cmd.startsWith("/")) {
        const match = slashMatches[slashIndex];
        const body = cmd.slice(1);
        const token = (body.split(/\s+/)[0] ?? "").toLowerCase();
        const hasArgs = body.includes(" ");
        const resolved = match && !hasArgs && token !== match.name ? `/${match.name}` : cmd;
        setSlashInput("");
        onSlash(resolved);
        return;
      }
      const action = actions[selected];
      if (!action || action.id === "quit") {
        onQuit();
        return;
      }
      onAction(action.id);
      return;
    }
    if (ch && !key.ctrl && !key.meta && ch >= " ") {
      setSlashInput(input + ch);
    }
  });

  const pathShort = shortPath(repoPath);
  const tips = tipLines(snap);
  const next = nextLines(rec, snap);
  const branches = branchLines(snap);
  const listBudget = Math.max(3, Math.min(8, rows - 18));
  const start = Math.max(0, Math.min(selected - listBudget + 2, actions.length - listBudget));
  const visible = actions.slice(start, start + listBudget);
  const frameWidth = Math.max(40, cols - 2);

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={ACCENT}
        width={frameWidth}
        paddingX={1}
      >
        <Text bold color={FG}>
          Welcome to gflows{" "}
          <Text color={MUTED} dimColor>
            v{version}
          </Text>
        </Text>
        <Text color={MUTED}>Git branching workflow · main + dev + short-lived branches</Text>
        <Text color={MUTED}>{pathShort}</Text>

        {flash ? (
          <Box marginTop={1}>
            <Text color={YELLOW}>│ {flash}</Text>
          </Box>
        ) : null}

        <Box marginTop={1} flexDirection="row">
          <Box width="50%" flexDirection="column" paddingRight={1}>
            <Text bold color={ACCENT}>
              Tips for getting started
            </Text>
            {tips.map((line) => (
              <Text key={line} color={MUTED}>
                {line}
              </Text>
            ))}
          </Box>
          <Box width="50%" flexDirection="column">
            <Text bold color={ACCENT}>
              What's next
            </Text>
            {next.map((line) => (
              <Text
                key={line}
                color={line.startsWith("→") ? GREEN : MUTED}
                bold={line.startsWith("→")}
              >
                {line}
              </Text>
            ))}
          </Box>
        </Box>

        <Box marginY={1} flexDirection="column">
          <Text bold color={FG}>
            Branches
          </Text>
          {loading ? (
            <Text color={MUTED}>Loading…</Text>
          ) : (
            branches.slice(0, 7).map((line) => (
              <Text key={line} color={MUTED}>
                {line}
              </Text>
            ))
          )}
        </Box>

        <Text color={MUTED}>Actions · ↑↓ select · enter · /command (wizards stay in-app)</Text>
        {visible.map((a, i) => {
          const abs = start + i;
          const active = abs === selected;
          return (
            <Text key={a.id} color={active ? FG : MUTED} bold={active}>
              {active ? <Text color={ACCENT}>❯ </Text> : "  "}
              {a.label}
              {a.hint ? (
                <Text color={MUTED}>
                  {"  "}
                  {a.hint}
                </Text>
              ) : null}
            </Text>
          );
        })}

        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text color={ACCENT}>❯ </Text>
            {input || <Text color={MUTED}>type / for commands…</Text>}
            {input ? <Text color={ACCENT}>█</Text> : null}
          </Text>
          {slashMode && slashMatches.length > 0 ? (
            <Box flexDirection="column" marginTop={0}>
              {slashMatches.slice(0, 8).map((item, i) => {
                const active = i === slashIndex;
                return (
                  <Text key={item.name} color={active ? FG : MUTED} bold={active}>
                    {active ? <Text color={ACCENT}>› </Text> : "  "}/{item.name}
                    <Text color={MUTED}>{`  ${item.hint}`}</Text>
                  </Text>
                );
              })}
              <Text color={MUTED}>↑↓ · tab complete · enter run · esc clear</Text>
            </Box>
          ) : (
            <Text color={MUTED}>
              {showHelp
                ? "/init /start /sync /pr /finish /doctor /help  ·  esc clear  ·  ctrl+c quit"
                : "? for shortcuts · / for command menu"}
            </Text>
          )}
        </Box>
      </Box>

      <Box width={cols} justifyContent="space-between">
        <Text backgroundColor="#282828" color={MUTED}>
          {" "}
          <Text color={ACCENT}>/init</Text> start sync pr finish{" "}
        </Text>
        <Text backgroundColor="#282828" color={MUTED}>
          {" "}
          {pathShort} <Text color={ACCENT}></Text> <Text color={FG}>{branch}</Text>{" "}
        </Text>
      </Box>
      {rec?.action === "init" ? <Text color={YELLOW}> Setup incomplete — run /init</Text> : null}
    </Box>
  );
}

function shortPath(p: string): string {
  const home = homedir();
  if (p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

function tipLines(snap: VizSnapshot | null): string[] {
  if (!snap || snap.needsInit) {
    return [
      "1. /init or select Initialize",
      "2. /start (wizard in hub)",
      "3. commit → /sync · /pr · /finish",
    ];
  }
  return [
    "• /start — wizard stays in this UI",
    "• /sync — update from base",
    "• /pr then /finish when ready",
  ];
}

function nextLines(rec: ReturnType<typeof recommend> | null, snap: VizSnapshot | null): string[] {
  if (!rec) return ["Not a git repo", "cd into a repo, then reopen"];
  return [`→ ${rec.label}`, rec.detail, snap?.current ? `on ${snap.current}` : ""].filter(Boolean);
}

function branchLines(snap: VizSnapshot | null): string[] {
  if (!snap) return ["(no repo)"];
  const lines: string[] = [];
  if (snap.suspended) lines.push(`⚠ suspended: ${snap.suspended}`);
  for (const row of snap.rows) {
    if (row.type !== "main" && row.type !== "dev") continue;
    const mark = row.current ? "●" : "○";
    lines.push(`${mark} ${row.name}  [${row.type}]`);
  }
  const workflow = snap.rows.filter((r) => r.type !== "main" && r.type !== "dev");
  if (workflow.length === 0) {
    lines.push("  (no workflow branches)");
  } else {
    for (let i = 0; i < workflow.length; i++) {
      const row = workflow[i];
      if (!row) continue;
      const elbow = i === workflow.length - 1 ? "└─" : "├─";
      const mark = row.current ? "●" : "○";
      const ab = row.ahead === 0 && row.behind === 0 ? "synced" : `+${row.ahead}/-${row.behind}`;
      lines.push(`${elbow} ${mark} ${row.name}  (${row.type}) ${ab}`);
    }
  }
  return lines;
}

function buildActions(snap: VizSnapshot | null, recommended: RecommendAction | null): ActionItem[] {
  const items: ActionItem[] = [];
  const push = (id: string, label: string, hint?: string) => {
    items.push({ id, label, hint });
  };
  if (snap?.needsInit) push("init", "Initialize repo", "/init");
  push("start", "Start new work", "/start");
  push("sync", "Sync with base", "/sync");
  push("pr", "Open pull request", "/pr");
  push("finish", "Finish / merge branch", "/finish");
  if (snap?.suspended) push("continue", "Continue suspended", "/continue");
  push("switch", "Switch branch", "/switch");
  push("list", "List branches", "/list");
  push("doctor", "Doctor", "/doctor");
  push("help", "Help", "/help");
  push("quit", "Quit", "q");

  const prefer = recommended && recommended !== "commit" ? recommended : null;
  if (prefer) {
    const idx = items.findIndex((a) => a.id === prefer);
    if (idx >= 0) {
      const [item] = items.splice(idx, 1);
      if (item) items.unshift({ ...item, label: `★ ${item.label.replace(/^★ /, "")}` });
    }
  }
  return items;
}
