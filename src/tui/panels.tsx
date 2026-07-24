/**
 * Shared Ink panels for in-hub result screens (doctor / help / status / …).
 * @module tui/panels
 */

import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useState } from "react";
import { WizardFrame } from "./prompts.js";

const ACCENT = "#E88C4A";
const MUTED = "#8A8A8A";
const FG = "#E6E6E6";
const GREEN = "#78C88C";
const RED = "#E06C75";

/** One styled line for {@link HubScrollPanel}. */
export interface HubPanelLine {
  /** Stable React key for the row. */
  id: string;
  text: string;
  tone?: "default" | "ok" | "bad" | "muted" | "accent";
}

/**
 * Scrollable framed panel that returns to the hub on enter/esc.
 */
export function HubScrollPanel({
  title,
  lines,
  loading,
  error,
  onDone,
}: {
  title: string;
  lines: HubPanelLine[] | null;
  loading?: boolean;
  error?: string | null;
  onDone: () => void;
}): React.ReactElement {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const lineCount = lines?.length ?? 0;
  const budget = Math.max(6, Math.min(lineCount || 6, rows - 8));
  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, lineCount - budget);
  const safeOffset = Math.min(offset, maxOffset);
  const visible = lines?.slice(safeOffset, safeOffset + budget) ?? [];

  useInput((ch, key) => {
    if (key.return || key.escape || (key.ctrl && ch === "c")) {
      onDone();
      return;
    }
    if (key.upArrow || ch === "k") {
      setOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow || ch === "j") {
      setOffset((o) => Math.min(maxOffset, o + 1));
      return;
    }
    if (key.pageUp) {
      setOffset((o) => Math.max(0, o - budget));
      return;
    }
    if (key.pageDown) {
      setOffset((o) => Math.min(maxOffset, o + budget));
    }
  });

  return (
    <WizardFrame title={title}>
      {loading || lines === null ? (
        <Text color={MUTED}>Loading…</Text>
      ) : error ? (
        <Text color={RED}>{error}</Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((line) => (
            <Text key={line.id} color={toneColor(line.tone)} bold={line.tone === "ok"}>
              {line.text}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={MUTED}>
          {maxOffset > 0 ? "↑↓ scroll · " : ""}
          enter / esc return to hub
        </Text>
        <Text color={ACCENT}> █</Text>
      </Box>
    </WizardFrame>
  );
}

function toneColor(tone: HubPanelLine["tone"]): string {
  switch (tone) {
    case "ok":
      return GREEN;
    case "bad":
      return RED;
    case "muted":
      return MUTED;
    case "accent":
      return ACCENT;
    default:
      return FG;
  }
}
