/**
 * Modern interactive prompts via @clack/prompts (replaces Inquirer).
 * @module prompts
 */

import * as clack from "@clack/prompts";

/**
 * Exits the process when the user cancels a prompt (Ctrl+C / Escape).
 */
function exitIfCancel<T>(value: T | symbol): asserts value is T {
  if (clack.isCancel(value)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }
}

/** Select option for {@link selectPrompt}. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Single-select prompt.
 */
export async function selectPrompt<T extends string>(opts: {
  message: string;
  options: SelectOption<T>[];
  initialValue?: T;
}): Promise<T> {
  // Clack's Option<T> conditional types don't accept generic T extends string cleanly.
  const value = await clack.select({
    message: opts.message,
    options: opts.options as never,
    initialValue: opts.initialValue,
  });
  exitIfCancel(value);
  return value as T;
}

/**
 * Yes/no confirm prompt.
 */
export async function confirmPrompt(opts: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean> {
  const value = await clack.confirm({
    message: opts.message,
    initialValue: opts.initialValue ?? true,
  });
  exitIfCancel(value);
  return value;
}

/**
 * Free-text input prompt.
 */
export async function inputPrompt(opts: {
  message: string;
  defaultValue?: string;
  placeholder?: string;
}): Promise<string> {
  const value = await clack.text({
    message: opts.message,
    defaultValue: opts.defaultValue,
    placeholder: opts.placeholder ?? opts.defaultValue,
  });
  exitIfCancel(value);
  return value;
}

/**
 * Multi-select (checkbox) prompt.
 */
export async function multiSelectPrompt<T extends string>(opts: {
  message: string;
  options: SelectOption<T>[];
}): Promise<T[]> {
  const value = await clack.multiselect({
    message: opts.message,
    options: opts.options as never,
    required: false,
  });
  exitIfCancel(value);
  return value as T[];
}
