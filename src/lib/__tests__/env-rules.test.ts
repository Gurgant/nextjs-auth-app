/**
 * @jest-environment node
 */

import {
  ENCRYPTION_KEY_PATTERN,
  isPublicPlaceholder,
  requireEncryptionKey,
} from "@/lib/env-rules";

const REAL_KEY =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

const envOf = (vars: Record<string, string | undefined>) =>
  vars as unknown as NodeJS.ProcessEnv;

describe("requireEncryptionKey", () => {
  it.each(["development", "test", "production"])(
    "throws when the key is missing or empty (%s)",
    (NODE_ENV) => {
      expect(() => requireEncryptionKey(envOf({ NODE_ENV }))).toThrow(
        /ENCRYPTION_KEY/,
      );
      expect(() =>
        requireEncryptionKey(envOf({ NODE_ENV, ENCRYPTION_KEY: "" })),
      ).toThrow(/ENCRYPTION_KEY/);
    },
  );

  it.each([
    [
      "the old development fallback",
      "dev-only-insecure-key-not-for-production-use!",
    ],
    ["a long non-hex string", "x".repeat(64)],
    ["63 hex characters", "a".repeat(63)],
    ["65 hex characters", "a".repeat(65)],
    ["a trailing newline", `${REAL_KEY}\n`],
  ])("rejects %s", (_label, key) => {
    expect(() =>
      requireEncryptionKey(
        envOf({ NODE_ENV: "development", ENCRYPTION_KEY: key }),
      ),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it("accepts a 64-hex key in either case", () => {
    for (const key of [REAL_KEY, REAL_KEY.toUpperCase()]) {
      expect(
        requireEncryptionKey(
          envOf({ NODE_ENV: "production", ENCRYPTION_KEY: key }),
        ),
      ).toBe(key);
    }
  });

  it("accepts the public example key in development/test but not in production", () => {
    const zero = "0".repeat(64);
    const ci = "0123456789abcdef".repeat(4);
    for (const key of [zero, ci]) {
      expect(
        requireEncryptionKey(
          envOf({ NODE_ENV: "development", ENCRYPTION_KEY: key }),
        ),
      ).toBe(key);
      expect(
        requireEncryptionKey(envOf({ NODE_ENV: "test", ENCRYPTION_KEY: key })),
      ).toBe(key);
      expect(() =>
        requireEncryptionKey(
          envOf({ NODE_ENV: "production", ENCRYPTION_KEY: key }),
        ),
      ).toThrow(/public/);
    }
  });

  it("never echoes the value in the error message", () => {
    const bad = "not-a-key-but-a-secret-looking-value-123456";
    try {
      requireEncryptionKey(
        envOf({ NODE_ENV: "production", ENCRYPTION_KEY: bad }),
      );
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).toMatch(/^ENCRYPTION_KEY:/);
      expect((error as Error).message).not.toContain(bad);
    }
  });
});

describe("isPublicPlaceholder", () => {
  it.each([
    "0".repeat(64),
    "0123456789ABCDEF".repeat(4),
    "generate-with-openssl-rand-base64-32-xxxx",
    "  your-resend-api-key  ",
  ])("flags %s", (value) => {
    expect(isPublicPlaceholder(value)).toBe(true);
  });

  it("does not flag real-looking values or empty input", () => {
    expect(isPublicPlaceholder(REAL_KEY)).toBe(false);
    expect(isPublicPlaceholder("re_live_abc123")).toBe(false);
    expect(isPublicPlaceholder(undefined)).toBe(false);
    expect(isPublicPlaceholder("")).toBe(false);
  });
});

it("ENCRYPTION_KEY_PATTERN is anchored", () => {
  expect(ENCRYPTION_KEY_PATTERN.test(`x${REAL_KEY}`)).toBe(false);
  expect(ENCRYPTION_KEY_PATTERN.test(REAL_KEY)).toBe(true);
});
