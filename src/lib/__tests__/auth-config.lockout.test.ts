/**
 * Credentials authorize(): account lockout + shared [email, IP] rate limit.
 *
 * The repository and 2FA helpers are mocked; the rate limiter is the real
 * one. next-auth, its providers and the Prisma adapter are ESM packages that
 * next/jest does not transform, so they are replaced with minimal stand-ins.
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

// findByCredentials/updateLastLogin are the pre-lockout API; they are set up
// where it matters so each test fails on the old code for the right reason.
const mockRepo = {
  verifyCredentials: jest.fn(),
  registerFailedLogin: jest.fn(),
  recordSuccessfulLogin: jest.fn(),
  findByCredentials: jest.fn(),
  updateLastLogin: jest.fn(),
};
const mockPrisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
const mockLogSecurityEvent = jest.fn();
const mockValidateTOTP = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));
jest.mock("@/lib/two-factor", () => ({
  validateTOTPCode: (...args: unknown[]) => mockValidateTOTP(...args),
  validateBackupCode: () => ({ valid: false, remainingCodes: [] }),
}));
jest.mock("@/lib/security", () => ({
  ...jest.requireActual("@/lib/security"),
  decrypt: (value: string) => value,
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

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

const DEFAULT_POLICY = { maxAttempts: 5, lockoutMs: 15 * 60_000 };
const alice = {
  id: "u1",
  email: "alice@example.com",
  name: "Alice",
  image: null,
  emailVerified: null,
  twoFactorEnabled: false,
  role: "USER",
};
const bob2fa = {
  ...alice,
  id: "u2",
  email: "bob@example.com",
  twoFactorEnabled: true,
};

/** Request stand-in: getClientIP()/user-agent only call headers.get(). */
const req = (ip: string, ua = "jest-agent") => ({
  headers: new Map([
    ["x-forwarded-for", ip],
    ["user-agent", ua],
  ]),
});

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
  mockRepo.registerFailedLogin.mockResolvedValue({
    attempts: 1,
    lockedUntil: null,
    lockedNow: false,
  });
  mockRepo.recordSuccessfulLogin.mockResolvedValue(undefined);
  mockLogSecurityEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("failed password attempts", () => {
  it("counts a wrong password against an existing account", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });

    await expect(
      authorize(
        { email: "alice@example.com", password: "nope" },
        req("203.0.113.7"),
      ),
    ).resolves.toBeNull();

    expect(mockRepo.registerFailedLogin).toHaveBeenCalledTimes(1);
    expect(mockRepo.registerFailedLogin).toHaveBeenCalledWith(
      "u1",
      DEFAULT_POLICY,
    );
  });

  it("honours MAX_LOGIN_ATTEMPTS and ACCOUNT_LOCKOUT_DURATION (minutes)", async () => {
    process.env.MAX_LOGIN_ATTEMPTS = "3";
    process.env.ACCOUNT_LOCKOUT_DURATION = "30";
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });

    await authorize(
      { email: "alice@example.com", password: "nope" },
      req("203.0.113.7"),
    );

    expect(mockRepo.registerFailedLogin).toHaveBeenCalledWith("u1", {
      maxAttempts: 3,
      lockoutMs: 30 * 60_000,
    });
  });

  it("does not count attempts against unknown emails", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: null,
    });

    await expect(
      authorize(
        { email: "ghost@example.com", password: "nope" },
        req("203.0.113.7"),
      ),
    ).resolves.toBeNull();
    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
  });

  it("logs account_locked exactly when the threshold is crossed", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });
    mockRepo.registerFailedLogin.mockResolvedValueOnce({
      attempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
      lockedNow: true,
    });

    await authorize(
      { email: "alice@example.com", password: "nope" },
      req("203.0.113.7"),
    );

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        eventType: "account_locked",
        success: false,
        ipAddress: "203.0.113.7",
        userAgent: "jest-agent",
      }),
    );

    mockLogSecurityEvent.mockClear();
    await authorize(
      { email: "alice@example.com", password: "nope" },
      req("203.0.113.7"),
    );
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  // One rule for what is kept of a request (requestMetadata in
  // src/lib/security.ts): the first forwarded address, and the User-Agent
  // cut to 512 characters.
  it("hands the lock event the client address and the User-Agent as requestMetadata reads them", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });
    mockRepo.registerFailedLogin.mockResolvedValueOnce({
      attempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
      lockedNow: true,
    });

    await authorize(
      { email: "alice@example.com", password: "nope" },
      req(
        "::ffff:203.0.113.7, 198.51.100.9",
        "A".repeat(600) + "B".repeat(600),
      ),
    );

    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent.mock.calls[0][0]).toMatchObject({
      eventType: "account_locked",
      ipAddress: "203.0.113.7",
      userAgent: "A".repeat(512),
    });
  });

  it("still rejects the attempt when lockout bookkeeping fails", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });
    mockRepo.registerFailedLogin.mockRejectedValueOnce(new Error("db down"));

    await expect(
      authorize(
        { email: "alice@example.com", password: "nope" },
        req("203.0.113.7"),
      ),
    ).resolves.toBeNull();
  });
});

describe("locked accounts", () => {
  it("get the same null as a wrong password, even with the right password and 2FA on", async () => {
    mockRepo.findByCredentials.mockResolvedValue(bob2fa);
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "locked",
      userId: "u2",
      lockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(
      authorize(
        { email: "bob@example.com", password: "Correct123!" },
        req("203.0.113.7"),
      ),
    ).resolves.toBeNull();

    // No 2FA stage (no 2fa_required hint), the lock is not extended, nothing reset.
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });
});

describe("two-factor stage", () => {
  beforeEach(() => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: bob2fa,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      twoFactorSecret: "s",
      backupCodes: [],
    });
  });

  it("a wrong 2FA code counts toward the lockout", async () => {
    mockValidateTOTP.mockReturnValue(false);

    await expect(
      authorize(
        {
          email: "bob@example.com",
          password: "Correct123!",
          totpCode: "000000",
        },
        req("203.0.113.7"),
      ),
    ).rejects.toHaveProperty("code", "2fa_invalid");

    expect(mockRepo.registerFailedLogin).toHaveBeenCalledWith(
      "u2",
      DEFAULT_POLICY,
    );
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("asking for the code is neither a failure nor a success", async () => {
    await expect(
      authorize(
        { email: "bob@example.com", password: "Correct123!" },
        req("203.0.113.7"),
      ),
    ).rejects.toHaveProperty("code", "2fa_required");

    expect(mockRepo.registerFailedLogin).not.toHaveBeenCalled();
    expect(mockRepo.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("a valid code resets the counters", async () => {
    mockValidateTOTP.mockReturnValue(true);

    await expect(
      authorize(
        {
          email: "bob@example.com",
          password: "Correct123!",
          totpCode: "123456",
        },
        req("203.0.113.7"),
      ),
    ).resolves.toMatchObject({ id: "u2" });
    expect(mockRepo.recordSuccessfulLogin).toHaveBeenCalledWith("u2");
  });
});

describe("successful sign-in", () => {
  it("resets the lockout counters", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: alice,
    });

    await expect(
      authorize(
        { email: "alice@example.com", password: "Correct123!" },
        req("203.0.113.7"),
      ),
    ).resolves.toMatchObject({ id: "u1", email: "alice@example.com" });
    expect(mockRepo.recordSuccessfulLogin).toHaveBeenCalledWith("u1");
  });
});

describe("shared [email, IP] rate limit", () => {
  const LIMIT = () => RATE_LIMITS.login.limit;

  it("blocks an IP spraying many emails — even a correct login from it — but not another IP", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: null,
    });
    for (let i = 0; i < LIMIT(); i++) {
      await authorize(
        { email: `spray${i}@example.com`, password: "nope" },
        req("198.51.100.9"),
      );
    }

    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: alice,
    });
    await expect(
      authorize(
        { email: "alice@example.com", password: "Correct123!" },
        req("198.51.100.9"),
      ),
    ).resolves.toBeNull();
    await expect(
      authorize(
        { email: "alice@example.com", password: "Correct123!" },
        req("198.51.100.10"),
      ),
    ).resolves.toMatchObject({ id: "u1" });
  });

  it("success clears the email counter but not the IP counter", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "invalid",
      userId: "u1",
    });
    for (let i = 0; i < 3; i++) {
      await authorize(
        { email: "alice@example.com", password: "nope" },
        req("203.0.113.7"),
      );
    }
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: alice,
    });
    await authorize(
      { email: "alice@example.com", password: "Correct123!" },
      req("203.0.113.7"),
    );

    expect(
      isRateLimited("login", ["alice@example.com"], RATE_LIMITS.login)
        .remaining,
    ).toBe(LIMIT());
    expect(
      isRateLimited("login", ["203.0.113.7"], RATE_LIMITS.login).remaining,
    ).toBe(LIMIT() - 3);
  });

  it("schema-invalid input is rejected before any lookup and is not counted", async () => {
    for (let i = 0; i <= LIMIT(); i++) {
      await expect(
        authorize({ email: "not-an-email", password: "x" }, req("192.0.2.1")),
      ).resolves.toBeNull();
    }
    expect(mockRepo.verifyCredentials).not.toHaveBeenCalled();

    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: alice,
    });
    await expect(
      authorize(
        { email: "alice@example.com", password: "Correct123!" },
        req("192.0.2.1"),
      ),
    ).resolves.toMatchObject({ id: "u1" });
  });
});
