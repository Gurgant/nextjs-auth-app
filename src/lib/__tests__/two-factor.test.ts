/**
 * @jest-environment node
 */

/**
 * TOTP verification window. The app promises ±1 time step (±30 s) of clock
 * drift tolerance (RFC 6238 §5.2) — no more, no less.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { authenticator } from "otplib";
import { validateTOTPCode } from "@/lib/two-factor";

const SECRET = "JBSWY3DPEHPK3PXP";
const STEP_MS = 30_000;

/** Code for the time step `offset` steps away from now (same secret). */
const codeAt = (offset: number) =>
  authenticator
    .clone({ epoch: Date.now() + offset * STEP_MS })
    .generate(SECRET);

describe("validateTOTPCode window", () => {
  it("accepts the current code", () => {
    expect(validateTOTPCode(codeAt(0), SECRET)).toBe(true);
  });

  it("accepts the previous and the next step (±30 s drift)", () => {
    expect(validateTOTPCode(codeAt(-1), SECRET)).toBe(true);
    expect(validateTOTPCode(codeAt(1), SECRET)).toBe(true);
  });

  it("rejects codes two or more steps away", () => {
    // Guard against the vanishing chance that a far code equals a near one.
    const near = new Set([codeAt(-1), codeAt(0), codeAt(1)]);
    for (const offset of [-3, -2, 2, 3]) {
      const code = codeAt(offset);
      if (!near.has(code)) {
        expect(validateTOTPCode(code, SECRET)).toBe(false);
      }
    }
  });

  it("rejects malformed input", () => {
    expect(validateTOTPCode("12345", SECRET)).toBe(false);
    expect(validateTOTPCode("abcdef", SECRET)).toBe(false);
    expect(validateTOTPCode("", SECRET)).toBe(false);
  });
});
