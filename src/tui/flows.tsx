/**
 * Multi-step Ink wizards for hub actions (start / finish / sync / list / switch / …).
 * @module tui/flows
 */

import { Text } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { resolveConfig } from "../config.js";
import { branchList, getCurrentBranch, isClean, resolveRepoRoot } from "../git.js";
import type { BranchType } from "../types.js";
import { collectVizSnapshot, type VizSnapshot } from "../viz.js";
import { type HubPanelLine, HubScrollPanel } from "./panels.js";
import { InkConfirm, InkSelect, InkText, WizardFrame } from "./prompts.js";

const MUTED = "#8A8A8A";

const BRANCH_TYPES: BranchType[] = ["feature", "bugfix", "chore", "release", "hotfix", "spike"];

type SwitchMode = "move" | "restore" | "clean" | "destroy" | "cancel";

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
 * Collects argv for `gflows release …` (quick release from dev) inside Ink.
 */
export function ReleaseFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [step, setStep] = useState<"type" | "push">("type");
  const [choice, setChoice] = useState<"current" | "patch" | "minor" | "major">("current");

  if (step === "type") {
    return (
      <WizardFrame title="Quick release from dev">
        <InkSelect<"current" | "patch" | "minor" | "major">
          message="Version for release"
          options={[
            { value: "current", label: "keep current" },
            { value: "patch", label: "bump patch (x.y.Z)" },
            { value: "minor", label: "bump minor (x.Y.0)" },
            { value: "major", label: "bump major (X.0.0)" },
          ]}
          onCancel={onCancel}
          onSubmit={(t) => {
            setChoice(t);
            setStep("push");
          }}
        />
      </WizardFrame>
    );
  }

  const title = choice === "current" ? "Release · keep current" : `Release · up ${choice}`;

  return (
    <WizardFrame title={title}>
      <InkConfirm
        message="Push after release?"
        initialValue={false}
        onCancel={onCancel}
        onSubmit={(push) => {
          onDone(
            choice === "current"
              ? ["release", "current", "-y", push ? "-p" : "-P"]
              : ["release", "up", choice, "-y", push ? "-p" : "-P"],
          );
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
 * Switch-branch wizard entirely inside Ink (avoids dead Clack after Ink unmount).
 */
export function SwitchFlow({
  cwd,
  onDone,
  onCancel,
}: {
  cwd: string;
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [step, setStep] = useState<"load" | "pick" | "dirty" | "error">("load");
  const [choices, setChoices] = useState<{ value: string; label: string }[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const root = await resolveRepoRoot(cwd);
        const config = resolveConfig(root, {}, {});
        const allLocal = await branchList(root, { dryRun: false, verbose: false });
        const workflow = BRANCH_TYPES.map((t) => config.prefixes[t])
          .filter(Boolean)
          .flatMap((prefix) => allLocal.filter((b) => b.startsWith(prefix)));
        const mainAndDev = [config.main, config.dev].filter((b) => allLocal.includes(b));
        const names = [...mainAndDev, ...[...new Set(workflow)].sort()];
        const current = await getCurrentBranch(root, {});
        if (cancelled) return;
        if (names.length === 0) {
          setError("No branches found.");
          setStep("error");
          return;
        }
        const opts = names.map((b) => ({
          value: b,
          label: current && b === current ? `${b} (current)` : b,
        }));
        setChoices(opts);
        setInitialIndex(Math.max(0, current ? names.indexOf(current) : 0));
        setStep("pick");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStep("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (step === "load") {
    return (
      <WizardFrame title="Switch branch">
        <Text color={MUTED}>Loading…</Text>
      </WizardFrame>
    );
  }

  if (step === "error") {
    return (
      <HubScrollPanel
        title="Switch branch"
        lines={[{ id: "e", text: error ?? "Unknown error", tone: "bad" }]}
        onDone={onCancel}
      />
    );
  }

  if (step === "pick") {
    return (
      <WizardFrame title="Switch branch">
        <InkSelect
          message="Switch to branch"
          options={choices}
          initialIndex={initialIndex}
          onCancel={onCancel}
          onSubmit={(branch) => {
            void (async () => {
              setTarget(branch);
              try {
                const root = await resolveRepoRoot(cwd);
                const clean = await isClean(root, {});
                if (clean) {
                  onDone(["switch", branch]);
                  return;
                }
                setStep("dirty");
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setStep("error");
              }
            })();
          }}
        />
      </WizardFrame>
    );
  }

  // dirty
  return (
    <WizardFrame title={`Switch · ${target}`}>
      <InkSelect<SwitchMode>
        message="Working tree has uncommitted changes"
        options={[
          { value: "move", label: "Move", hint: "carry changes to target" },
          { value: "restore", label: "Restore", hint: "stash here, restore target" },
          { value: "clean", label: "Clean", hint: "discard changes" },
          { value: "destroy", label: "Destroy", hint: "delete current branch" },
          { value: "cancel", label: "Cancel", hint: "abort switch" },
        ]}
        onCancel={onCancel}
        onSubmit={(mode) => {
          if (mode === "cancel") {
            onCancel();
            return;
          }
          onDone(["switch", target, `--${mode}`]);
        }}
      />
    </WizardFrame>
  );
}

/**
 * Init wizard inside Ink; dispatches with -y so CLI skips Clack prompts.
 */
export function InitFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [step, setStep] = useState<"main" | "dev" | "remote" | "alias">("main");
  const [main, setMain] = useState("main");
  const [dev, setDev] = useState("dev");
  const [remote, setRemote] = useState("origin");

  if (step === "main") {
    return (
      <WizardFrame title="Initialize repo">
        <InkText
          message="Main branch name"
          placeholder="main"
          initialValue="main"
          onCancel={onCancel}
          onSubmit={(v) => {
            setMain(v || "main");
            setStep("dev");
          }}
        />
      </WizardFrame>
    );
  }
  if (step === "dev") {
    return (
      <WizardFrame title="Initialize repo">
        <InkText
          message="Dev branch name"
          placeholder="dev"
          initialValue="dev"
          onCancel={onCancel}
          onSubmit={(v) => {
            setDev(v || "dev");
            setStep("remote");
          }}
        />
      </WizardFrame>
    );
  }
  if (step === "remote") {
    return (
      <WizardFrame title="Initialize repo">
        <InkText
          message="Remote name"
          placeholder="origin"
          initialValue="origin"
          onCancel={onCancel}
          onSubmit={(v) => {
            setRemote(v || "origin");
            setStep("alias");
          }}
        />
      </WizardFrame>
    );
  }

  return (
    <WizardFrame title="Initialize repo">
      <InkSelect
        message="Add package.json script alias?"
        options={[
          { value: "g", label: 'script "g"', hint: "prefer: alias g=gflows in shell" },
          { value: "gflows", label: 'script "gflows"' },
          { value: "skip", label: "Skip", hint: "shell alias is best for hub TTY" },
        ]}
        onCancel={onCancel}
        onSubmit={(alias) => {
          const argv = ["init", "-y", "-P", "--main", main, "--dev", dev, "--remote", remote];
          if (alias === "skip") argv.push("--no-script-alias");
          else argv.push("--script-alias", alias);
          onDone(argv);
        }}
      />
    </WizardFrame>
  );
}

/**
 * Bump wizard inside Ink.
 */
export function BumpFlow({
  onDone,
  onCancel,
}: {
  onDone: (argv: string[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [step, setStep] = useState<"dir" | "type">("dir");
  const [direction, setDirection] = useState<"up" | "down">("up");

  if (step === "dir") {
    return (
      <WizardFrame title="Bump version">
        <InkSelect<"up" | "down">
          message="Direction"
          options={[
            { value: "up", label: "Up (bump)" },
            { value: "down", label: "Down (rollback)" },
          ]}
          onCancel={onCancel}
          onSubmit={(d) => {
            setDirection(d);
            setStep("type");
          }}
        />
      </WizardFrame>
    );
  }

  return (
    <WizardFrame title={`Bump · ${direction}`}>
      <InkSelect<"patch" | "minor" | "major">
        message="Semver part"
        options={[
          { value: "patch", label: "patch" },
          { value: "minor", label: "minor" },
          { value: "major", label: "major" },
        ]}
        onCancel={onCancel}
        onSubmit={(type) => onDone(["bump", direction, type])}
      />
    </WizardFrame>
  );
}

/**
 * Styled branch list inside the hub (no drop-out to plain stdout).
 */
export function ListFlow({ cwd, onDone }: { cwd: string; onDone: () => void }): React.ReactElement {
  const [lines, setLines] = useState<HubPanelLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await collectVizSnapshot(cwd);
        if (!cancelled) {
          setLines(
            formatListLines(snap).map((text, i) => ({
              id: `b${i}`,
              text,
              tone: text.includes("●") ? ("ok" as const) : ("default" as const),
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

  return <HubScrollPanel title="Branches" lines={lines} error={error} onDone={onDone} />;
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
