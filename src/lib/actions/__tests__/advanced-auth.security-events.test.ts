/**
 * @jest-environment node
 *
 * The security events of the e-mail verification and 2FA actions record the
 * client IP and the User-Agent of the request by the rule of requestMetadata
 * (src/lib/security.ts): the IP as getClientIP reads it, which is a valid
 * address or nothing, and the User-Agent cut to 512 characters. The client
 * chooses both headers.
 * logSecurityEvent bounds both by itself, so the row alone does not tell
 * whether an action did: what each action hands to logSecurityEvent is
 * checked as well.
 * The real @/lib/security is used, down to the row handed to Prisma (only
 * decrypt is replaced: the form of the test holds no real ciphertext, and
 * logSecurityEvent records what it is handed before it runs); the Prisma
 * client, the session, the e-mails, the rate limiter and the TOTP check are
 * mocked.
 */
// Translations answer with the English fallback the action passes in.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateSuccess: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
}));

const mockHeaders = jest.fn<Promise<Headers>, []>();
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

jest.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "user-123" } }),
}));

// The rate limiter has its own unit test: here it always allows.
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: () => ({
    blocked: false,
    remaining: 99,
    retryAfterSeconds: 0,
  }),
  RATE_LIMITS: { emailVerify: { limit: 5, windowMs: 900000 } },
}));

const mockFindUser = jest.fn();
const mockFindToken = jest.fn();
const mockCreateEvent = jest.fn();
jest.mock("@/lib/prisma", () => {
  const client = {
    user: {
      findUnique: () => mockFindUser(),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    emailVerificationToken: {
      create: async () => ({}),
      findUnique: () => mockFindToken(),
      updateMany: async () => ({ count: 1 }),
    },
    securityEvent: { create: (args: unknown) => mockCreateEvent(args) },
    // A transaction hands its function a client: this one.
    $transaction: async (work: (tx: unknown) => unknown) => work(client),
  };
  return { prisma: client };
});

const mockHandedToLogSecurityEvent = jest.fn();
jest.mock("@/lib/security", () => {
  const actual =
    jest.requireActual<typeof import("@/lib/security")>("@/lib/security");
  return {
    ...actual,
    decrypt: () => "JBSWY3DPEHPK3PXP",
    logSecurityEvent: (...args: Parameters<typeof actual.logSecurityEvent>) => {
      mockHandedToLogSecurityEvent(...args);
      return actual.logSecurityEvent(...args);
    },
  };
});

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: async () => true,
  sendSecurityAlert: async () => true,
}));

jest.mock("@/lib/two-factor", () => ({
  isValidSecret: () => true,
  validateTOTPCode: () => true,
  generateNewBackupCodes: () => ["AAAA-BBBB"],
  encryptBackupCodes: () => ["encrypted-code"],
}));

jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => "en",
}));

import {
  sendEmailVerification,
  verifyEmailToken,
  enableTwoFactorAuth,
  disableTwoFactorAuth,
} from "../advanced-auth";

const USER = {
  id: "user-123",
  email: "someone@example.com",
  name: "Someone",
  emailVerified: null,
};

function enableForm(): FormData {
  const formData = new FormData();
  formData.set("encryptedSecret", "an-encrypted-secret");
  formData.set("verificationCode", "123456");
  return formData;
}

// Every action of the file that writes a security event, with the type of
// the event and the user row it finds.
const WRITERS = [
  [
    "sendEmailVerification",
    "email_verified",
    USER,
    () => sendEmailVerification(USER.email, "en"),
  ],
  [
    "verifyEmailToken",
    "email_verified",
    USER,
    () => verifyEmailToken("token-1", "en"),
  ],
  [
    "enableTwoFactorAuth",
    "2fa_enabled",
    { ...USER, twoFactorEnabled: false },
    () => enableTwoFactorAuth(enableForm(), "ignored"),
  ],
  [
    "disableTwoFactorAuth",
    "2fa_disabled",
    { ...USER, twoFactorEnabled: true },
    () => disableTwoFactorAuth("ignored", "en"),
  ],
] as const;

describe.each(WRITERS)(
  "the security event of %s",
  (_action, eventType, user, run) => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockFindUser.mockResolvedValue(user);
      // The row as the action's query returns it: with the verification date
      // of its user.
      mockFindToken.mockResolvedValue({
        id: "token-row-1",
        userId: USER.id,
        used: false,
        expires: new Date(Date.now() + 60_000),
        user: { emailVerified: null },
      });
      mockCreateEvent.mockResolvedValue({ id: "event-1" });
    });

    /** The row the action wrote for a request with these headers. */
    async function recorded(requestHeaders: Record<string, string>) {
      mockHeaders.mockResolvedValue(new Headers(requestHeaders));
      await expect(run()).resolves.toMatchObject({ success: true });
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      return mockCreateEvent.mock.calls[0][0].data;
    }

    it("records the first valid entry of X-Forwarded-For and the User-Agent", async () => {
      const event = await recorded({
        "x-forwarded-for": "203.0.113.7, 198.51.100.9",
        "user-agent": "Mozilla/5.0 (request)",
      });

      expect(event).toMatchObject({
        userId: USER.id,
        eventType,
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0 (request)",
      });
    });

    it("cuts a long User-Agent to 512 characters", async () => {
      const longAgent = "A".repeat(600) + "B".repeat(600);

      const event = await recorded({ "user-agent": longAgent });

      expect(event.userAgent).toBe(longAgent.slice(0, 512));
    });

    it("leaves out a forwarded value that is not an IP address", async () => {
      const event = await recorded({ "x-forwarded-for": "<script>, unknown" });

      expect(event.ipAddress).toBeUndefined();
    });

    it("leaves both out when the request carries neither", async () => {
      const event = await recorded({});

      expect(event.ipAddress).toBeUndefined();
      expect(event.userAgent).toBeUndefined();
    });

    // The four tests above read the row, which logSecurityEvent bounds by
    // itself. This one reads what the action hands over.
    it("hands logSecurityEvent the address and the User-Agent already cut", async () => {
      const longAgent = "A".repeat(600) + "B".repeat(600);

      await recorded({
        "x-forwarded-for": "203.0.113.7, 198.51.100.9",
        "user-agent": longAgent,
      });

      expect(mockHandedToLogSecurityEvent.mock.calls).toStrictEqual([
        [
          {
            userId: USER.id,
            eventType,
            details: expect.any(String),
            ipAddress: "203.0.113.7",
            userAgent: longAgent.slice(0, 512),
          },
        ],
      ]);
    });
  },
);

// The verification page calls verifyEmailToken while it renders, and the same
// address is requested again on a reload, on a change of language and by the
// user after a mail scanner opened the link.
describe("verifyEmailToken, asked again with a token it has used", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockCreateEvent.mockResolvedValue({ id: "event-1" });
  });

  it("writes no second event for an address that is verified", async () => {
    mockFindToken.mockResolvedValue({
      id: "token-row-1",
      userId: USER.id,
      used: true,
      expires: new Date(Date.now() + 60_000),
      user: { emailVerified: new Date("2026-01-01T10:00:00Z") },
    });

    await expect(verifyEmailToken("token-1", "en")).resolves.toMatchObject({
      success: true,
      data: { alreadyVerified: true },
    });

    expect(mockHandedToLogSecurityEvent).not.toHaveBeenCalled();
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it("writes no event for an address that is not verified", async () => {
    mockFindToken.mockResolvedValue({
      id: "token-row-1",
      userId: USER.id,
      used: true,
      expires: new Date(Date.now() + 60_000),
      user: { emailVerified: null },
    });

    await expect(verifyEmailToken("token-1", "en")).resolves.toMatchObject({
      success: false,
    });

    expect(mockHandedToLogSecurityEvent).not.toHaveBeenCalled();
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });
});
