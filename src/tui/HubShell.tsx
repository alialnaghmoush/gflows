/**
 * Persistent Ink hub shell: home map + in-app wizards (no Clack drop-out for prompts).
 * @module tui/HubShell
 */

import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useState } from "react";
import {
  BumpFlow,
  FinishFlow,
  InitFlow,
  ListFlow,
  ReleaseFlow,
  StartFlow,
  SwitchFlow,
  SyncFlow,
} from "./flows.js";
import { HubHome } from "./HubHome.js";
import { WizardFrame } from "./prompts.js";
import { SLASH_COMMANDS } from "./slash.js";
import { ConfigView, DoctorView, HelpView, InfoView, StatusView, VersionView } from "./views.js";

const ACCENT = "#E88C4A";
const MUTED = "#8A8A8A";
const FG = "#E6E6E6";

/** Outcome of one hub session (Ink unmounts after this). */
export type HubSessionResult = { kind: "quit" } | { kind: "run"; argv: string[] };

type Screen =
  | { id: "home"; flash?: string }
  | { id: "start" }
  | { id: "finish" }
  | { id: "release" }
  | { id: "sync" }
  | { id: "list" }
  | { id: "switch" }
  | { id: "init" }
  | { id: "bump" }
  | { id: "doctor" }
  | { id: "info" }
  | { id: "help" }
  | { id: "status" }
  | { id: "config" }
  | { id: "version" }
  | { id: "notice"; message: string };

/** Commands that leave Ink for git / side effects (no interactive Clack). */
const DISPATCH_COMMANDS = new Set([
  "pr",
  "continue",
  "delete",
  "undo",
  "abort",
  "schema",
  "mcp",
  "completion",
]);

/**
 * Props for the hub shell.
 */
export interface HubShellProps {
  cwd: string;
  onDone: (result: HubSessionResult) => void;
}

/**
 * Fullscreen hub with embedded wizards.
 */
export function HubShell({ cwd, onDone }: HubShellProps): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>({ id: "home" });

  const finish = (result: HubSessionResult) => {
    onDone(result);
    exit();
  };

  const cancelWizard = () => setScreen({ id: "home" });
  const runArgv = (argv: string[]) => finish({ kind: "run", argv });

  const openInHub = (cmd: string): boolean => {
    switch (cmd) {
      case "start":
        setScreen({ id: "start" });
        return true;
      case "finish":
        setScreen({ id: "finish" });
        return true;
      case "release":
        setScreen({ id: "release" });
        return true;
      case "sync":
        setScreen({ id: "sync" });
        return true;
      case "list":
        setScreen({ id: "list" });
        return true;
      case "switch":
        setScreen({ id: "switch" });
        return true;
      case "init":
        setScreen({ id: "init" });
        return true;
      case "bump":
        setScreen({ id: "bump" });
        return true;
      case "doctor":
        setScreen({ id: "doctor" });
        return true;
      case "info":
        setScreen({ id: "info" });
        return true;
      case "help":
        setScreen({ id: "help" });
        return true;
      case "status":
        setScreen({ id: "status" });
        return true;
      case "config":
        setScreen({ id: "config" });
        return true;
      case "version":
        setScreen({ id: "version" });
        return true;
      case "viz":
        setScreen({ id: "home", flash: "Branch map is shown on this screen." });
        return true;
      default:
        return false;
    }
  };

  const handleSlash = (raw: string) => {
    const parts = raw.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase();
    const rest = parts.slice(1);

    if (!cmd || cmd === "quit" || cmd === "exit" || cmd === "q") {
      finish({ kind: "quit" });
      return;
    }

    if (cmd === "start") {
      if (rest.length >= 2) {
        const type = rest[0] ?? "feature";
        const name = rest[1] ?? "";
        runArgv(["start", type, name, "-P", ...rest.slice(2)]);
        return;
      }
      setScreen({ id: "start" });
      return;
    }
    if (cmd === "finish") {
      if (rest.length > 0) {
        runArgv(["finish", "-y", "-P", ...rest]);
        return;
      }
      setScreen({ id: "finish" });
      return;
    }
    if (cmd === "release") {
      if (rest.length > 0) {
        runArgv(["release", "-y", "-P", ...rest]);
        return;
      }
      setScreen({ id: "release" });
      return;
    }
    if (cmd === "sync") {
      if (rest.length > 0) {
        runArgv(["sync", "--force", ...rest]);
        return;
      }
      setScreen({ id: "sync" });
      return;
    }
    if (cmd === "config" && rest.length > 0) {
      runArgv(["config", ...rest]);
      return;
    }
    if (cmd === "switch" && rest.length > 0) {
      runArgv(["switch", ...rest]);
      return;
    }
    if (cmd === "bump" && rest.length > 0) {
      runArgv(["bump", ...rest]);
      return;
    }
    if (cmd === "init" && rest.length > 0) {
      runArgv(["init", ...rest]);
      return;
    }

    if (openInHub(cmd)) return;

    if (!DISPATCH_COMMANDS.has(cmd) && !SLASH_COMMANDS.some((c) => c.name === cmd)) {
      setScreen({
        id: "notice",
        message: `Unknown /${cmd} — type / for command hints.`,
      });
      return;
    }

    if (!DISPATCH_COMMANDS.has(cmd)) {
      setScreen({
        id: "notice",
        message: `/${cmd} is not available from the hub yet.`,
      });
      return;
    }

    runArgv([cmd, ...rest]);
  };

  const handleHome = (action: string) => {
    if (action === "quit") {
      finish({ kind: "quit" });
      return;
    }
    if (openInHub(action)) return;
    runArgv([action]);
  };

  if (screen.id === "start") {
    return <StartFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "finish") {
    return <FinishFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "release") {
    return <ReleaseFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "sync") {
    return <SyncFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "list") {
    return <ListFlow cwd={cwd} onDone={cancelWizard} />;
  }
  if (screen.id === "switch") {
    return <SwitchFlow cwd={cwd} onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "init") {
    return <InitFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "bump") {
    return <BumpFlow onCancel={cancelWizard} onDone={runArgv} />;
  }
  if (screen.id === "doctor") {
    return <DoctorView cwd={cwd} onDone={cancelWizard} />;
  }
  if (screen.id === "info") {
    return <InfoView cwd={cwd} onDone={cancelWizard} />;
  }
  if (screen.id === "help") {
    return <HelpView onDone={cancelWizard} />;
  }
  if (screen.id === "status") {
    return <StatusView cwd={cwd} onDone={cancelWizard} />;
  }
  if (screen.id === "config") {
    return <ConfigView cwd={cwd} onDone={cancelWizard} />;
  }
  if (screen.id === "version") {
    return <VersionView onDone={cancelWizard} />;
  }
  if (screen.id === "notice") {
    return (
      <PressEnter
        title="Notice"
        message={screen.message}
        onDone={() => setScreen({ id: "home" })}
      />
    );
  }

  return (
    <HubHome
      cwd={cwd}
      flash={screen.flash}
      onAction={handleHome}
      onSlash={handleSlash}
      onQuit={() => finish({ kind: "quit" })}
    />
  );
}

function PressEnter({
  title,
  message,
  onDone,
}: {
  title: string;
  message: string;
  onDone: () => void;
}): React.ReactElement {
  useInput((_ch, key) => {
    if (key.return || key.escape) onDone();
  });

  return (
    <WizardFrame title={title}>
      <Text color={FG}>{message}</Text>
      <Box marginTop={1}>
        <Text color={MUTED}>Press enter to continue</Text>
        <Text color={ACCENT}> █</Text>
      </Box>
    </WizardFrame>
  );
}
