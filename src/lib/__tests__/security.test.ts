/**
 * @jest-environment node
 */

/**
 * encrypt()/decrypt() key handling: ENCRYPTION_KEY is required in every
 * environment (no hardcoded fallback), must be 64 hex characters, and the
 * public example/CI values are refused in production.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import CryptoJS from "crypto-js";
import { encrypt, decrypt } from "@/lib/security";

// NODE_ENV is read-only on modern Node; jest.replaceProperty stubs it per test.
const env = process.env as Record<string, string>;
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;
const KEY = "a1b2c3d4".repeat(8); // test-only, 64 hex chars

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  process.env.ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("encrypt/decrypt — key is required everywhere", () => {
  it.each(["development", "test", "production"])(
    "throws a configuration error when ENCRYPTION_KEY is unset (%s)",
    (nodeEnv) => {
      jest.replaceProperty(env, "NODE_ENV", nodeEnv);
      delete process.env.ENCRYPTION_KEY;

      expect(() => encrypt("JBSWY3DPEHPK3PXP")).toThrow(/ENCRYPTION_KEY/);
      expect(() => decrypt("U2FsdGVkX1+abc")).toThrow(/ENCRYPTION_KEY/);
    },
  );

  it("rejects a long key that is not 64 hex characters", () => {
    jest.replaceProperty(env, "NODE_ENV", "development");
    process.env.ENCRYPTION_KEY = "x".repeat(40);

    expect(() => encrypt("secret")).toThrow(/ENCRYPTION_KEY/);
  });

  it("refuses the public .env.example key in production only", () => {
    process.env.ENCRYPTION_KEY = "0".repeat(64);

    jest.replaceProperty(env, "NODE_ENV", "development");
    expect(() => encrypt("secret")).not.toThrow();

    jest.replaceProperty(env, "NODE_ENV", "production");
    expect(() => encrypt("secret")).toThrow(/ENCRYPTION_KEY/);
  });

  it("never echoes the key value in the error", () => {
    jest.replaceProperty(env, "NODE_ENV", "production");
    const bad = "z".repeat(64);
    process.env.ENCRYPTION_KEY = bad;

    let message = "";
    try {
      encrypt("secret");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/ENCRYPTION_KEY/);
    expect(message).not.toContain(bad);
  });
});

describe("encrypt/decrypt — behaviour with a valid key", () => {
  it("round-trips", () => {
    expect(decrypt(encrypt("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses the key as a CryptoJS passphrase (OpenSSL 'Salted__' format)", () => {
    const ciphertext = encrypt("hello");
    expect(Buffer.from(ciphertext, "base64").subarray(0, 8).toString()).toBe(
      "Salted__",
    );
    expect(
      CryptoJS.AES.decrypt(ciphertext, KEY).toString(CryptoJS.enc.Utf8),
    ).toBe("hello");
  });

  it("does not recover the plaintext with a different key", () => {
    const ciphertext = encrypt("JBSWY3DPEHPK3PXP");
    process.env.ENCRYPTION_KEY = "f".repeat(64);

    let recovered: string | null;
    try {
      recovered = decrypt(ciphertext);
    } catch {
      recovered = null;
    }
    expect(recovered).not.toBe("JBSWY3DPEHPK3PXP");
  });
});
