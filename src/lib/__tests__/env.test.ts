/**
 * @jest-environment node
 */

/**
 * Boot-time environment validation (src/lib/env.ts), exercised through the
 * real module-load path: the module validates process.env when imported.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// The shipped template, read as a developer would copy it.
const EXAMPLE = dotenv.parse(
  fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8"),
);

const REAL = {
  DATABASE_URL: "postgresql://app:pw@db.internal:5432/app",
  AUTH_SECRET: "k7Qp2vX9mR4tW8yZ1bN6cF3hJ5lD0sA-realistic-secret",
  NEXTAUTH_URL: "https://auth.example.org",
  ENCRYPTION_KEY:
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
};

function boot(vars: Record<string, string | undefined>) {
  jest.replaceProperty(process, "env", vars as NodeJS.ProcessEnv);
  let loaded: typeof import("@/lib/env") | undefined;
  jest.isolateModules(() => {
    loaded = require("@/lib/env");
  });
  return loaded!;
}

function bootError(vars: Record<string, string | undefined>): string {
  try {
    boot(vars);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the environment to be rejected");
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("development", () => {
  it("boots with .env.example as shipped", () => {
    expect(() => boot({ ...EXAMPLE, NODE_ENV: "development" })).not.toThrow();
  });

  it("refuses to boot without ENCRYPTION_KEY", () => {
    const { ENCRYPTION_KEY: _omit, ...rest } = EXAMPLE;
    expect(bootError({ ...rest, NODE_ENV: "development" })).toMatch(
      /ENCRYPTION_KEY/,
    );
  });

  it("refuses to boot without a session secret (Auth.js needs one in dev too)", () => {
    const { AUTH_SECRET: _a, NEXTAUTH_SECRET: _n, ...rest } = EXAMPLE;
    expect(bootError({ ...rest, NODE_ENV: "development" })).toMatch(
      /AUTH_SECRET/,
    );
  });

  it("refuses a non-hex ENCRYPTION_KEY", () => {
    expect(
      bootError({
        ...EXAMPLE,
        NODE_ENV: "development",
        ENCRYPTION_KEY: "x".repeat(64),
      }),
    ).toMatch(/ENCRYPTION_KEY/);
  });
});

describe("production", () => {
  it("boots with real-looking values", () => {
    expect(() => boot({ ...REAL, NODE_ENV: "production" })).not.toThrow();
  });

  it("refuses the public .env.example secrets, naming each variable", () => {
    const message = bootError({
      ...EXAMPLE,
      NODE_ENV: "production",
      NEXTAUTH_URL: "https://auth.example.org",
      RESEND_API_KEY: "your-resend-api-key",
    });
    expect(message).toMatch(/AUTH_SECRET/);
    expect(message).toMatch(/NEXTAUTH_SECRET/);
    expect(message).toMatch(/ENCRYPTION_KEY/);
    expect(message).toMatch(/RESEND_API_KEY/);
  });

  it("never prints a secret value", () => {
    const secret = "123456789012".repeat(4);
    const message = bootError({
      ...REAL,
      NODE_ENV: "production",
      AUTH_SECRET: "xq7",
      ENCRYPTION_KEY: secret,
    });
    expect(message).not.toContain(secret);
    expect(message).not.toContain("xq7");
  });
});

describe("SESSION_MAX_AGE (seconds)", () => {
  it("is optional", () => {
    expect(boot({ ...REAL, NODE_ENV: "production" }).env.SESSION_MAX_AGE).toBe(
      undefined,
    );
  });

  it("accepts a value inside 300..2592000", () => {
    expect(
      boot({ ...REAL, NODE_ENV: "production", SESSION_MAX_AGE: "604800" }).env
        .SESSION_MAX_AGE,
    ).toBe(604800);
  });

  it.each(["7", "299", "2592001", "604800000", "abc"])(
    "rejects %s",
    (value) => {
      expect(
        bootError({ ...REAL, NODE_ENV: "production", SESSION_MAX_AGE: value }),
      ).toMatch(/SESSION_MAX_AGE/);
    },
  );
});
