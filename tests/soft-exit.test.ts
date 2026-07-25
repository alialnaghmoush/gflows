/**
 * Soft process.exit trap for hub dispatch.
 */

import { describe, expect, test } from "bun:test";
import { runWithSoftExit, SoftExitError } from "../src/soft-exit.ts";

describe("runWithSoftExit", () => {
  test("converts process.exit(0) into SoftExitError", async () => {
    await expect(
      runWithSoftExit(async () => {
        process.exit(0);
      }),
    ).rejects.toBeInstanceOf(SoftExitError);

    try {
      await runWithSoftExit(async () => {
        process.exit(0);
      });
    } catch (err) {
      expect(err).toBeInstanceOf(SoftExitError);
      expect((err as SoftExitError).code).toBe(0);
    }
  });

  test("preserves non-zero exit codes", async () => {
    try {
      await runWithSoftExit(async () => {
        process.exit(2);
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SoftExitError);
      expect((err as SoftExitError).code).toBe(2);
    }
  });

  test("restores real process.exit after soft mode", async () => {
    const before = process.exit;
    try {
      await runWithSoftExit(async () => {
        process.exit(0);
      });
    } catch {
      // expected
    }
    expect(process.exit).toBe(before);
  });

  test("returns value when fn does not exit", async () => {
    const value = await runWithSoftExit(async () => 42);
    expect(value).toBe(42);
  });
});
