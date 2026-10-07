/**
 * @jest-environment node
 */

/**
 * TOTP verification window. The app promises ±1 time step (±30 s) of clock
 * drift tolerance (RFC 6238 §5.2) — no more, no less.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

// The QR code cannot be drawn: what setupTwoFactor() reports then.
jest.mock("qrcode", () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn().mockRejectedValue(new Error("no canvas")),
  },
}));

import { authenticator } from "otplib";
import {
  generateTOTPSecret,
  setupTwoFactor,
  validateBackupCode,
  validateTOTPCode,
} from "@/lib/two-factor";
import { decrypt, encrypt, generateBackupCodes } from "@/lib/security";
import enMessages from "../../../messages/en.json";

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

/**
 * setupTwoFactor() throws one Error for whatever went wrong inside it. The
 * action that calls it logs that Error and answers with
 * Errors.failedToSetupTwoFactor: the two texts are the same English sentence.
 */
describe("setupTwoFactor", () => {
  it('reports a failure as the message of messages/en.json does: the verb is "set up"', async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(setupTwoFactor("reader@example.com")).rejects.toEqual(
      new Error("Failed to set up two-factor authentication"),
    );
    expect(enMessages.Errors.failedToSetupTwoFactor).toBe(
      "Failed to set up two-factor authentication",
    );
    // The cause was the QR code, and it was logged.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

/**
 * What is stored is encrypted with ENCRYPTION_KEY, and there is no key
 * rotation: after the key was changed, the stored secret and the stored
 * backup codes are read with a key they were not written with. CryptoJS then
 * answers, for most values, the empty text (measured outside the suite: 1754
 * of 2000 secrets and 1882 of 2000 codes; the others throw or give a few
 * bytes of something else). Nothing may be accepted against such a value:
 * otplib computes a code for the empty secret, and anyone can compute it
 * too; and "-" without its hyphen is the empty text as well.
 */
const CURRENT_KEY = process.env.ENCRYPTION_KEY as string;
const OTHER_KEY = "fedcba9876543210".repeat(4);

/**
 * `text` as a row written with another key, chosen so that the current key
 * reads it as the empty text (the common case).
 */
function writtenWithAnotherKey(text: string): string {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    process.env.ENCRYPTION_KEY = OTHER_KEY;
    const row = encrypt(text);
    process.env.ENCRYPTION_KEY = CURRENT_KEY;
    let read: string | undefined;
    try {
      read = decrypt(row);
    } catch {
      // This row cannot be read at all: another one.
    }
    if (read === "") return row;
  }
  throw new Error("no row of another key was read as the empty text");
}

describe("a stored value that the current key cannot read", () => {
  beforeEach(() => {
    // decrypt() logs the rows it cannot read.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = CURRENT_KEY;
    jest.restoreAllMocks();
  });

  it("the fixture is what it says: rows of another key, read as the empty text", () => {
    expect(CURRENT_KEY).not.toBe(OTHER_KEY);
    expect(decrypt(writtenWithAnotherKey("ABCD-EF12"))).toBe("");
    expect(decrypt(writtenWithAnotherKey(SECRET))).toBe("");
    // And a row of the current key is read as it was written.
    expect(decrypt(encrypt("ABCD-EF12"))).toBe("ABCD-EF12");
  });

  describe("validateBackupCode", () => {
    // What a person can send in place of a code, down to nothing at all.
    it.each(["-", "", " - ", "--", " ", "ABCD-EF12", "abcdef12"])(
      "accepts %p against none of eight rows of another key, and keeps the rows",
      (input) => {
        const rows = generateBackupCodes(8).map(writtenWithAnotherKey);

        expect(validateBackupCode(input, rows)).toEqual({
          valid: false,
          remainingCodes: rows,
        });
      },
    );

    it("accepts no input that is not a whole code, whatever a row holds", () => {
      // Rows of the current key that hold no whole code: nothing, a short
      // text, a long one.
      const rows = ["", "ABC", "ABCD-EF123"].map(encrypt);

      for (const input of ["", "-", "ABC", "abc", "ABCD-EF123", "ABCDEF123"]) {
        expect(validateBackupCode(input, rows)).toEqual({
          valid: false,
          remainingCodes: rows,
        });
      }
    });

    it("still accepts a code of the current key as a person types it, once", () => {
      const codes = ["ABCD-EF12", "K7QM-2XWA", "B4ND-9TCE"];
      const rows = codes.map(encrypt);

      for (const typed of [
        "K7QM-2XWA",
        "k7qm 2xwa",
        "k7qm2xwa",
        " K7QM-2XWA ",
      ]) {
        expect(validateBackupCode(typed, rows)).toEqual({
          valid: true,
          remainingCodes: [rows[0], rows[2]],
        });
      }
      // The code that was used is gone from what remains.
      expect(validateBackupCode("K7QM-2XWA", [rows[0], rows[2]])).toEqual({
        valid: false,
        remainingCodes: [rows[0], rows[2]],
      });
      // Seven and nine characters are no code.
      expect(validateBackupCode("K7QM-2XW", rows).valid).toBe(false);
      expect(validateBackupCode("K7QM-2XWAA", rows).valid).toBe(false);
    });

    it("a code of the current key among rows of another key is found, and the other rows stay", () => {
      const unreadable = generateBackupCodes(3).map(writtenWithAnotherKey);
      const own = encrypt("R8HV-3YLP");

      expect(
        validateBackupCode("R8HV-3YLP", [unreadable[0], own, unreadable[1]]),
      ).toEqual({
        valid: true,
        remainingCodes: [unreadable[0], unreadable[1]],
      });
    });
  });

  describe("validateTOTPCode", () => {
    it("the empty secret has a code that anyone can compute", () => {
      expect(authenticator.generate("")).toMatch(/^[0-9]{6}$/);
      expect(
        authenticator.verify({ token: authenticator.generate(""), secret: "" }),
      ).toBe(true);
    });

    it("accepts no code against a secret of another key, also not the code of the empty secret", () => {
      const secret = decrypt(writtenWithAnotherKey(SECRET));

      expect(validateTOTPCode(authenticator.generate(""), secret)).toBe(false);
      expect(validateTOTPCode(codeAt(0), secret)).toBe(false);
    });

    it("accepts no code against a text that is no whole secret", () => {
      for (const secret of [
        "",
        " ",
        "JBSWY3DP",
        "not base32 at all!",
        "MZXW6===",
      ]) {
        const code = (() => {
          try {
            return authenticator.generate(secret);
          } catch {
            return "000000";
          }
        })();

        expect([secret, validateTOTPCode(code, secret)]).toEqual([
          secret,
          false,
        ]);
      }
    });

    it("still accepts the code of a whole secret, in lower case and with spaces around it too", () => {
      expect(validateTOTPCode(codeAt(0), SECRET)).toBe(true);
      expect(validateTOTPCode(codeAt(0), ` ${SECRET.toLowerCase()} `)).toBe(
        true,
      );
    });
  });
});

/**
 * "Whole" is measured against what the application itself makes: if the
 * length or the letters of a new secret or of a new backup code ever change,
 * these fail before a user finds that the code of a fresh enrolment is
 * refused.
 */
describe("what the application generates is whole", () => {
  it("a secret of generateTOTPSecret(): its code is accepted", () => {
    for (let round = 0; round < 20; round += 1) {
      const secret = generateTOTPSecret();

      expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
      expect(validateTOTPCode(authenticator.generate(secret), secret)).toBe(
        true,
      );
    }
  });

  it("the codes of generateBackupCodes(): each is accepted, and taken out of the rows", () => {
    const codes = generateBackupCodes(8);
    const rows = codes.map(encrypt);

    expect(new Set(codes).size).toBe(8);
    for (const [index, code] of codes.entries()) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(validateBackupCode(code, rows)).toEqual({
        valid: true,
        remainingCodes: rows.filter((_, other) => other !== index),
      });
    }
  });
});
