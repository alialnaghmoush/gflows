/**
 * Multi-step Ink wizards for hub actions (start / finish / sync / list).
 * @module tui/flows
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type { BranchType } from "../types.js";
import { collectVizSnapshot, type VizSnapshot } from "../viz.js";
import { InkConfirm, InkSelect, InkText, WizardFrame } from "./prompts.js";

const MUTED = "#8A8A8A";
const FG = "#E6E6E6";
const GREEN = "#78C88C";
const ACCENT = "#E88C4A";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

/**
 * Collects argv for `gflows start …` entirely inside Ink.
 */
export function StartFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [step, setStep] = useState<"type" | "name" | "push" | "fromMain">("type");
  const [type, setType] = useState<BranchType>("feature");
  const [name, setName] = useState("");
  const [push, setPush] = useState(false);

  if (step === "type") {
    return (
      <WizardFrame title="Start new work">
        <InkSelect
          message="Branch type"
          options={BRANCH_TYPES.map((t) => ({ value: t, label: t }))}
          onCancel={onCancel}
          onSubmit={(t) => {
            setType(t);
            setStep("name");
          }}
        />
      </WizardFrame>
    );
  }

  if (step === "name") {
    return (
      <WizardFrame title={`Start · ${type}`}>
        <InkText
          message={type === "release" || type === "hotfix" ? "Version (vX.Y.Z)" : "Branch name"}
          placeholder={type === "release" || type === "hotfix" ? "v1.0.0" : "my-thing"}
          onCancel={onCancel}
          onSubmit={(n) => {
            setName(n);
            setStep("push");
          }}
        />
      </WizardFrame>
    );
  }

  if (step === "push") {
    return (
      <WizardFrame title={`Start · ${type}/${name}`}>
        <InkConfirm
          message="Push after create?"
          initialValue={false}
          onCancel={onCancel}
          onSubmit={(p) => {
            setPush(p);
            if (type === "bugfix") setStep("fromMain");
            else onDone(["start", type, name, p ? "-p" : "-P"]);
          }}
        />
      </WizardFrame>
    );
  }

  // fromMain
  return (
    <WizardFrame title={`Start · bugfix/${name}`}>
      <InkConfirm
        message="Base from main (production fix)?"
        initialValue={false}
        onCancel={onCancel}
        onSubmit={(fromMain) => {
          const argv = ["start", type, name, push ? "-p" : "-P"];
          if (fromMain) argv.push("-o", "main");
          onDone(argv);
        }}
      />
    </WizardFrame>
  );
}

/**
 * Collects argv for `gflows finish …` entirely inside Ink.
 */
export function FinishFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <WizardFrame title="Finish / merge branch">
      <InkConfirm
        message="Push after finish?"
        initialValue={false}
        onCancel={onCancel}
        onSubmit={(push) => {
          onDone(["finish", "-y", push ? "-p" : "-P"]);
        }}
      />
    </WizardFrame>
  );
}

/**
 * Collects argv for `gflows sync …` entirely inside Ink.
 */
export function SyncFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <WizardFrame title="Sync with base">
      <InkConfirm
        message="Rebase onto base (instead of merge)?"
        initialValue={false}
        onCancel={onCancel}
        onSubmit={(rebase) => {
          onDone(["sync", ...(rebase ? ["--rebase"] : []), "--force"]);
        }}
      />
    </WizardFrame>
  );
}

/**
 * Styled branch list inside the hub (no drop-out to plain stdout).
 */
export function ListFlow({ cwd, onDone }: { cwd: string; onDone: () => void }): React.ReactElement {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await collectVizSnapshot(cwd);
        if (!cancelled) setLines(formatListLines(snap));
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

  useInput((_ch, key) => {
    if (key.return || key.escape || (key.ctrl && _ch === "c")) onDone();
  });

  return (
    <WizardFrame title="Branches">
      {lines === null ? (
        <Text color={MUTED}>Loading…</Text>
      ) : error ? (
        <Text color={FG}>{error}</Text>
      ) : (
        <Box flexDirection="column">
          {lines.map((line) => {
            const current = line.includes("●");
            return (
              <Text key={line} color={current ? GREEN : FG} bold={current}>
                {line}
              </Text>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={MUTED}>enter / esc return to hub</Text>
        <Text color={ACCENT}> █</Text>
      </Box>
    </WizardFrame>
  );
}

/**
 * Formats a viz snapshot into hub list rows.
 */
function formatListLines(snap: VizSnapshot): string[] {
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
