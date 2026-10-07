/**
 * Credentials authorize() after ENCRYPTION_KEY was changed.
 *
 * There is no key rotation: the TOTP secret and the backup codes of a user
 * who enabled 2FA stay encrypted with the old key. The current key reads most
 * of them as the empty text (see two-factor.test.ts). Such a user cannot sign
 * in with e-mail and password until an operator clears the 2FA columns, and
 * nobody who knows the password gets past the second factor either:
 *   - "-" as a backup code is the empty text once its hyphen is taken away;
 *   - the six digits that otplib computes for the empty secret are public.
 * Both are refused as a wrong code and counted like one.
 *
 * The repository is mocked. The 2FA helpers, the encryption and the rate
 * limiter are the real ones. next-auth, its providers and the Prisma adapter
 * are ESM packages that next/jest does not transform, so they are replaced
 * with minimal stand-ins.
 */

jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({
    id: "credentials",
    type: "credentials",
    options,
  }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: () => ({ id: "google", type: "oidc" }),
}));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));

const mockRepo = {
  verifyCredentials: jest.fn(),
  registerFailedLogin: jest.fn(),
  recordSuccessfulLogin: jest.fn(),
};
const mockPrisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
const mockLogSecurityEvent = jest.fn();

// Read when it is used: the imports below load this module before the
// constants above are set.
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockPrisma;
  },
}));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));
jest.mock("@/lib/security", () => ({
  ...jest.requireActual("@/lib/security"),
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

import { authenticator } from "otplib";
import { decrypt, encrypt, generateBackupCodes } from "@/lib/security";
import {
  __resetRateLimitStore,
  isRateLimited,
  RATE_LIMITS,
} from "@/lib/rate-limit";

type Authorize = (
  credentials: Record<string, unknown>,
  request?: unknown,
) => Promise<unknown>;

// Loaded after the mock factories above are in place.
const { authOptions } = require("@/lib/auth-config");
const authorize: Authorize = authOptions.providers.find(
  (p: { id: string }) => p.id === "credentials",
).options.authorize;

const CURRENT_KEY = process.env.ENCRYPTION_KEY as string;
const OTHER_KEY = "fedcba9876543210".repeat(4);
const SECRET = "JBSWY3DPEHPK3PXP";
const DEFAULT_POLICY = { maxAttempts: 5, lockoutMs: 15 * 60_000 };

const user = {
  id: "u-2fa",
  email: "carol@example.com",
  name: "Carol",
  image: null,
  emailVerified: null,
  twoFactorEnabled: true,
  role: "USER",
  sessionVersion: 0,
};
const PASSWORD = { email: user.email, password: "Correct-Horse-1" };

/** Request stand-in: getClientIP()/user-agent only call headers.get(). */
const request = {
  headers: new Map([
    ["x-forwarded-for", "203.0.113.9"],
    ["user-agent", "jest-agent"],
  ]),
};

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

/** What the user row holds of the second factor. */
function stored(row: { twoFactorSecret: string; backupCodes: string[] }) {
  mockPrisma.user.findUnique.mockResolvedValue(row);
}

const twoFactorIsThrottled = () =>
  isRateLimited("2fa", [user.id], RATE_LIMITS.twoFactor).blocked;

const savedEnv = {
  MAX_LOGIN_ATTEMPTS: process.env.MAX_LOGIN_ATTEMPTS,
  ACCOUNT_LOCKOUT_DURATION: process.env.ACCOUNT_LOCKOUT_DURATION,
};

beforeEach(() => {
  jest.resetAllMocks();
  __resetRateLimitStore();
  // next/jest loads the developer's .env; pin the policy to its defaults.
  delete process.env.MAX_LOGIN_ATTEMPTS;
  delete process.env.ACCOUNT_LOCKOUT_DURATION;
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockRepo.verifyCredentials.mockResolvedValue({ status: "valid", user });
  mockRepo.registerFailedLogin.mockResolvedValue({
    attempts: 1,
    lockedUntil: null,
    lockedNow: false,
  });
  mockRepo.recordSuccessfulLogin.mockResolvedValue(undefined);
  mockPrisma.user.update.mockResolvedValue(undefined);
  mockLogSecurityEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.ENCRYPTION_KEY = CURRENT_KEY;
  jest.restoreAllMocks();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("with a secret and backup codes written with the current key (the harness signs in)", () => {
  const codes = ["ABCD-EF12", "K7QM-2XWA"];

  it("the code of the authenticator signs in", async () => {
    stored({
      twoFactorSecret: encrypt(SECRET),
      backupCodes: codes.map(encrypt),
    });

    await expect(
      authorize(
        { ...PASSWORD, totpCode: authenticator.generate(SECRET) },
        request,
      ),
    ).resolves.toMatchObject({ id: user.id, email: user.email });
    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("a backup code signs in and is taken out of the row", async () => {
    const rows = codes.map(encrypt);
    stored({ twoFactorSecret: encrypt(SECRET), backupCodes: rows });

    await expect(
      authorize({ ...PASSWORD, backupCode: "k7qm 2xwa" }, request),
    ).resolves.toMatchObject({ id: user.id });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { backupCodes: [rows[0]] },
    });
    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
  });
});

describe("with a secret and backup codes written with another key", () => {
  beforeEach(() => {
    stored({
      twoFactorSecret: writtenWithAnotherKey(SECRET),
      backupCodes: generateBackupCodes(8).map(writtenWithAnotherKey),
    });
  });

  it.each(["-", " - ", "--", "- -"])(
    "the backup code %p is refused, with the answer of a wrong code, and counted as a failed second factor",
    async (backupCode) => {
      await expect(
        authorize({ ...PASSWORD, backupCode }, request),
      ).rejects.toHaveProperty("code", "2fa_invalid");

      // No code was used up, the failure went to the lockout counter, and
      // nobody was recorded as signed in.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockRepo.registerFailedLogin).toHaveBeenCalledTimes(1);
      expect(mockRepo.registerFailedLogin).toHaveBeenCalledWith(
        user.id,
        DEFAULT_POLICY,
      );
      expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
    },
  );

  it("the code that anyone can compute for the empty secret is refused and counted", async () => {
    await expect(
      authorize({ ...PASSWORD, totpCode: authenticator.generate("") }, request),
    ).rejects.toHaveProperty("code", "2fa_invalid");

    expect(mockRepo.registerFailedLogin).toHaveBeenCalledTimes(1);
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("both together are refused as well", async () => {
    await expect(
      authorize(
        { ...PASSWORD, totpCode: authenticator.generate(""), backupCode: "-" },
        request,
      ),
    ).rejects.toHaveProperty("code", "2fa_invalid");

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("five such attempts use up the 2FA throttle of the account", async () => {
    expect(twoFactorIsThrottled()).toBe(false);

    for (
      let attempt = 1;
      attempt <= RATE_LIMITS.twoFactor.limit;
      attempt += 1
    ) {
      await expect(
        authorize({ ...PASSWORD, backupCode: "-" }, request),
      ).rejects.toHaveProperty("code", "2fa_invalid");
    }

    expect(mockRepo.registerFailedLogin).toHaveBeenCalledTimes(
      RATE_LIMITS.twoFactor.limit,
    );
    expect(twoFactorIsThrottled()).toBe(true);
  });

  it("the real codes of the user do not sign in either, until the columns are cleared", async () => {
    await expect(
      authorize(
        { ...PASSWORD, totpCode: authenticator.generate(SECRET) },
        request,
      ),
    ).rejects.toHaveProperty("code", "2fa_invalid");
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("the password alone is still answered with the code step", async () => {
    await expect(authorize({ ...PASSWORD }, request)).rejects.toHaveProperty(
      "code",
      "2fa_required",
    );
    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
  });
});
