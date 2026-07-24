/**
 * Multi-step Ink wizards for hub actions (start / finish / sync).
 * @module tui/flows
 */

import type React from "react";
import { useState } from "react";
import type { BranchType } from "../types.js";
import { InkConfirm, InkSelect, InkText, WizardFrame } from "./prompts.js";

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
