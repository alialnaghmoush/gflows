/**
 * Read-only Ink screens that stay inside the hub (doctor / info / help / status / config).
 * @module tui/views
 */

import type React from "react";
import { useEffect, useState } from "react";
import { collectDoctorReport } from "../commands/doctor.js";
import { getHelpText } from "../commands/help.js";
import { collectInfo } from "../commands/info.js";
import { collectStatusLines } from "../commands/status-lines.js";
import { resolveConfig } from "../config.js";
import { resolveRepoRoot } from "../git.js";
import { formatInfoReport } from "../repo-inspect.js";
import { getVersion } from "../version.js";
import { type HubPanelLine, HubScrollPanel } from "./panels.js";

/**
 * Doctor checks inside the hub.
 */
export function DoctorView({
  cwd,
  onDone,
}: {
  cwd: string;
  onDone: () => void;
}): React.ReactElement {
  const [lines, setLines] = useState<HubPanelLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const report = await collectDoctorReport(cwd);
        if (cancelled) return;
        const rows: HubPanelLine[] = report.checks.map((c) => ({
          id: c.name,
          text: `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`,
          tone: c.ok ? "ok" : "bad",
        }));
        rows.push({
          id: "summary",
          text: report.ok
            ? "gflows doctor: all critical checks passed."
            : "gflows doctor: some checks failed.",
          tone: report.ok ? "ok" : "bad",
        });
        setLines(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLines([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return <HubScrollPanel title="Doctor" lines={lines} error={error} onDone={onDone} />;
}

/**
 * Repo layout / versions / stacks inside the hub.
 */
export function InfoView({ cwd, onDone }: { cwd: string; onDone: () => void }): React.ReactElement {
  const [lines, setLines] = useState<HubPanelLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const report = await collectInfo(cwd);
        if (cancelled) return;
        const rows: HubPanelLine[] = formatInfoReport(report).map((text, i) => ({
          id: `i${i}`,
          text: text.length === 0 ? " " : text,
          tone:
            text.startsWith("Repo:") ||
            text.startsWith("Frontend:") ||
            text.startsWith("Fullstack:")
              ? "accent"
              : "default",
        }));
        setLines(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLines([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return <HubScrollPanel title="Info" lines={lines} error={error} onDone={onDone} />;
}

/**
 * Scrollable help inside the hub.
 */
export function HelpView({ onDone }: { onDone: () => void }): React.ReactElement {
  const lines: HubPanelLine[] = getHelpText()
    .split("\n")
    .map((text, i) => ({
      id: `h${i}`,
      text: text.length === 0 ? " " : text,
      tone: text.endsWith(":") || text.startsWith("gflows") ? "accent" : "default",
    }));

  return <HubScrollPanel title="Help" lines={lines} onDone={onDone} />;
}

/**
 * Branch status inside the hub.
 */
export function StatusView({
  cwd,
  onDone,
}: {
  cwd: string;
  onDone: () => void;
}): React.ReactElement {
  const [lines, setLines] = useState<HubPanelLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await collectStatusLines(cwd);
        if (!cancelled) {
          setLines(
            rows.map((row, i) => ({
              id: `s${i}`,
              text: row.text,
              tone: row.tone,
            })),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLines([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return <HubScrollPanel title="Status" lines={lines} error={error} onDone={onDone} />;
}

/**
 * Resolved config snapshot inside the hub (read-only).
 */
export function ConfigView({
  cwd,
  onDone,
}: {
  cwd: string;
  onDone: () => void;
}): React.ReactElement {
  const [lines, setLines] = useState<HubPanelLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const root = await resolveRepoRoot(cwd);
        const config = resolveConfig(root, {}, {});
        if (cancelled) return;
        setLines([
          { id: "main", text: `main: ${config.main}`, tone: "accent" },
          { id: "dev", text: `dev: ${config.dev}` },
          { id: "remote", text: `remote: ${config.remote}` },
          { id: "prefixes", text: "prefixes:", tone: "muted" },
          ...Object.entries(config.prefixes).map(([type, prefix]) => ({
            id: `p-${type}`,
            text: `  ${type}: ${prefix}`,
          })),
          { id: "blank", text: " ", tone: "muted" },
          {
            id: "hint",
            text: "Use: gflows config set <key> <value>",
            tone: "muted",
          },
        ]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLines([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return <HubScrollPanel title="Config" lines={lines} error={error} onDone={onDone} />;
}

/**
 * Version chip inside the hub.
 */
export function VersionView({ onDone }: { onDone: () => void }): React.ReactElement {
  return (
    <HubScrollPanel
      title="Version"
      lines={[{ id: "v", text: `gflows v${getVersion()}`, tone: "accent" }]}
      onDone={onDone}
    />
  );
}
