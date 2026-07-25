/**
 * Soft process.exit for hub-embedded command dispatch.
 * Commands that call process.exit would otherwise kill the hub loop.
 * @module soft-exit
 */

/**
 * Thrown instead of terminating the process when soft-exit mode is active.
 */
export class SoftExitError extends Error {
  /**
   * @param code - Exit code the command requested.
   */
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "SoftExitError";
  }
}

/**
 * Runs `fn` while intercepting `process.exit` as {@link SoftExitError}.
 * Restores the real `process.exit` afterward.
 */
export async function runWithSoftExit<T>(fn: () => Promise<T>): Promise<T> {
  const realExit = process.exit;
  const softExit = ((code?: number) => {
    throw new SoftExitError(code ?? 0);
  }) as typeof process.exit;

  process.exit = softExit;
  try {
    return await fn();
  } finally {
    process.exit = realExit;
  }
}
