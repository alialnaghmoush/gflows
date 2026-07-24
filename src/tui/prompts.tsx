/**
 * Ink-native prompts used inside the hub (no Clack drop-out).
 * @module tui/prompts
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useState } from "react";

const ACCENT = "#E88C4A";
const MUTED = "#8A8A8A";
const FG = "#E6E6E6";

/** Option for {@link InkSelect}. */
export interface InkSelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Arrow-key select list.
 */
export function InkSelect<T extends string>({
  message,
  options,
  initialIndex = 0,
  onSubmit,
  onCancel,
}: {
  message: string;
  options: InkSelectOption<T>[];
  initialIndex?: number;
  onSubmit: (value: T) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [selected, setSelected] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, options.length - 1)),
  );

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch === "c")) {
      onCancel?.();
      return;
    }
    if (key.upArrow) {
      setSelected((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const opt = options[selected];
      if (opt) onSubmit(opt.value);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={FG}>
        {message}
      </Text>
      {options.map((opt, i) => {
        const active = i === selected;
        return (
          <Text key={opt.value} color={active ? FG : MUTED} bold={active}>
            {active ? <Text color={ACCENT}>❯ </Text> : "  "}
            {opt.label}
            {opt.hint ? <Text color={MUTED}>{`  ${opt.hint}`}</Text> : null}
          </Text>
        );
      })}
      <Text color={MUTED}>↑↓ · enter · esc cancel</Text>
    </Box>
  );
}

/**
 * Yes/no confirm (←/→ or y/n).
 */
export function InkConfirm({
  message,
  initialValue = true,
  onSubmit,
  onCancel,
}: {
  message: string;
  initialValue?: boolean;
  onSubmit: (value: boolean) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(initialValue);

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch === "c")) {
      onCancel?.();
      return;
    }
    if (key.leftArrow || key.rightArrow || ch === " ") {
      setValue((v) => !v);
      return;
    }
    if (ch === "y" || ch === "Y") {
      onSubmit(true);
      return;
    }
    if (ch === "n" || ch === "N") {
      onSubmit(false);
      return;
    }
    if (key.return) onSubmit(value);
  });

  return (
    <Box flexDirection="column">
      <Text bold color={FG}>
        {message}
      </Text>
      <Text>
        <Text color={value ? ACCENT : MUTED} bold={value}>
          {value ? "●" : "○"} Yes
        </Text>
        {"   "}
        <Text color={!value ? ACCENT : MUTED} bold={!value}>
          {!value ? "●" : "○"} No
        </Text>
      </Text>
      <Text color={MUTED}>←→ / y n · enter · esc cancel</Text>
    </Box>
  );
}

/**
 * Single-line text input.
 */
export function InkText({
  message,
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
}: {
  message: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(initialValue);

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch === "c")) {
      onCancel?.();
      return;
    }
    if (key.return) {
      const out = value.trim() || (placeholder ?? "");
      if (out) onSubmit(out);
      return;
    }
    if (key.backspace || key.delete) {
      setValue((s) => [...s].slice(0, -1).join(""));
      return;
    }
    if (ch && !key.ctrl && !key.meta && ch >= " ") {
      setValue((s) => s + ch);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={FG}>
        {message}
      </Text>
      <Text>
        <Text color={ACCENT}>❯ </Text>
        {value || <Text color={MUTED}>{placeholder ?? ""}</Text>}
        <Text color={ACCENT}>█</Text>
      </Text>
      <Text color={MUTED}>type · enter · esc cancel</Text>
    </Box>
  );
}

/**
 * Framed wizard chrome around a prompt step.
 */
export function WizardFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1} paddingY={0}>
      <Text bold color={ACCENT}>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
