// Mock server translations FIRST before any other imports. The actions pass
// an English fallback message with every key, and the mock answers with it.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: jest
    .fn()
    .mockImplementation(
      async (locale: string, key: string, fallback?: string) => fallback || key,
    ),
  translateSuccess: jest
    .fn()
    .mockImplementation(
      async (locale: string, key: string, fallback?: string) => fallback || key,
    ),
}));

import {
  setupTwoFactorAuth,
  disableTwoFactorAuth,
  sendEmailVerification,
  verifyEmailToken,
} from "../advanced-auth";

// Mock Next.js headers. No test reads one: what the actions take from the
// request goes through @/lib/security, which is mocked below.
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Map()),
}));

// Account-scoped actions derive the acting user from the session — mock it so
// they resolve to the same test user the prisma mocks return.
jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "user-123" } }),
}));

// Isolate these action tests from the real in-memory rate limiter (it has its
// own dedicated unit test): always allow.
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: jest.fn(() => ({
    blocked: false,
    remaining: 99,
    retryAfterSeconds: 0,
  })),
  RATE_LIMITS: {
    emailVerify: { limit: 5, windowMs: 900000 },
  },
}));

// Mock other dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/security");
jest.mock("@/lib/email");
jest.mock("@/lib/two-factor");

// Get the mocked prisma
const { prisma: mockPrisma } = require("@/lib/prisma");

// Get the mocked translation helpers: their first argument is the locale an
// action answers in
const {
  translateError,
  translateSuccess,
} = require("@/lib/utils/server-translations");

// Values a client can send as the locale argument of an action
const UNSUPPORTED_LOCALES = ["xx", '"><script>alert(1)</script>', "en-US", ""];

// Mock implementations for security functions
require("@/lib/security").generateSecureToken = jest
  .fn()
  .mockReturnValue("mock-secure-token");
require("@/lib/security").encrypt = jest.fn().mockReturnValue("encrypted-data");
require("@/lib/security").logSecurityEvent = jest
  .fn()
  .mockResolvedValue(undefined);
require("@/lib/security").getClientIP = jest.fn().mockReturnValue("127.0.0.1");

// Mock implementations for email functions
require("@/lib/email").sendVerificationEmail = jest
  .fn()
  .mockResolvedValue(true);
require("@/lib/email").sendSecurityAlert = jest.fn().mockResolvedValue(true);

// Mock implementation for the one two-factor function these tests reach
require("@/lib/two-factor").setupTwoFactor = jest.fn().mockResolvedValue({
  secret: "JBSWY3DPEHPK3PXP",
  qrCodeUrl: "otpauth://totp/TestApp?secret=JBSWY3DPEHPK3PXP",
  backupCodes: ["backup1", "backup2"],
});

describe("Advanced Authentication Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("setupTwoFactorAuth", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      twoFactorEnabled: false,
    };

    it("should setup 2FA successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await setupTwoFactorAuth("user-123", "en");

      expect(result.success).toBe(true);
      expect(result.message).toContain("2FA setup initiated");
    });

    it("should return error when 2FA already enabled", async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };

      mockPrisma.user.findUnique.mockResolvedValue(userWith2FA);

      const result = await setupTwoFactorAuth("user-123", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("already enabled");
    });

    it("should return error when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await setupTwoFactorAuth("user-123", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("User not found");
    });

    // The locale is an argument the client sends: only a supported one is used.
    it("answers in a supported locale as requested", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await setupTwoFactorAuth("user-123", "de");

      expect(result.success).toBe(true);
      expect(translateSuccess.mock.calls).toEqual([
        ["de", "success.twoFactorSetupInitiated", "2FA setup initiated"],
      ]);
    });

    it.each(UNSUPPORTED_LOCALES)(
      "answers in the default locale instead of %p",
      async (locale) => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);

        const result = await setupTwoFactorAuth("user-123", locale);

        expect(result.success).toBe(true);
        expect(translateSuccess.mock.calls).toEqual([
          ["en", "success.twoFactorSetupInitiated", "2FA setup initiated"],
        ]);
      },
    );
  });

  describe("disableTwoFactorAuth", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
      backupCodes: ["backup1", "backup2"],
    };

    it("should disable 2FA successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
      });

      const result = await disableTwoFactorAuth("user-123", "en");

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: [],
        },
      });
    });

    it("should return error when 2FA not enabled", async () => {
      const userWithout2FA = { ...mockUser, twoFactorEnabled: false };

      mockPrisma.user.findUnique.mockResolvedValue(userWithout2FA);

      const result = await disableTwoFactorAuth("user-123", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not enabled");
    });

    // The locale is an argument the client sends: only a supported one is used.
    it("answers in a supported locale as requested", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await disableTwoFactorAuth("user-123", "de");

      expect(result.success).toBe(true);
      expect(translateSuccess.mock.calls).toEqual([
        ["de", "success.twoFactorDisabled", "2FA disabled successfully"],
      ]);
    });

    it.each(UNSUPPORTED_LOCALES)(
      "answers in the default locale instead of %p",
      async (locale) => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);

        const result = await disableTwoFactorAuth("user-123", locale);

        expect(result.success).toBe(true);
        expect(translateSuccess.mock.calls).toEqual([
          ["en", "success.twoFactorDisabled", "2FA disabled successfully"],
        ]);
      },
    );
  });

  describe("sendEmailVerification", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      emailVerified: null,
    };

    it("should send email verification successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await sendEmailVerification("test@example.com", "en");

      expect(result.success).toBe(true);
      expect(result.message).toContain("Verification email sent successfully");
    });

    it("should return error when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await sendEmailVerification(
        "nonexistent@example.com",
        "en",
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("User not found");
    });

    it("should return error when email already verified", async () => {
      const verifiedUser = {
        ...mockUser,
        emailVerified: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(verifiedUser);

      const result = await sendEmailVerification("test@example.com", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("already verified");
    });

    // The action needs no session and its locale goes into the e-mailed link.
    it.each(UNSUPPORTED_LOCALES)(
      "hands the e-mail the default locale instead of %p",
      async (locale) => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);

        await sendEmailVerification("test@example.com", locale);

        expect(
          require("@/lib/email").sendVerificationEmail,
        ).toHaveBeenCalledWith(
          "test@example.com",
          "",
          "mock-secure-token",
          "en",
        );
      },
    );

    it("hands the e-mail a supported locale as it is", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await sendEmailVerification("test@example.com", "de");

      expect(require("@/lib/email").sendVerificationEmail).toHaveBeenCalledWith(
        "test@example.com",
        "",
        "mock-secure-token",
        "de",
      );
    });
  });

  describe("verifyEmailToken", () => {
    const validToken = {
      id: "token-row-1",
      userId: "user-123",
      used: false,
      expires: new Date(Date.now() + 30 * 60 * 1000),
    };

    it("verifies the e-mail of the owner of the token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
        validToken,
      );

      const result = await verifyEmailToken("token-1", "en");

      expect(result.success).toBe(true);
      expect(result.message).toContain("Email verified successfully");
      expect(mockPrisma.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        { where: { token: "token-1" }, include: { user: true } },
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("should return error when the token is unknown", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      const result = await verifyEmailToken("no-such-token", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid verification token");
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    // The action is an endpoint that needs no session, and the locale is an
    // argument the client sends: only a supported one is used.
    it("answers in a supported locale as requested", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
        validToken,
      );

      const result = await verifyEmailToken("token-1", "de");

      expect(result.success).toBe(true);
      expect(translateSuccess.mock.calls).toEqual([
        ["de", "success.emailVerified", "Email verified successfully"],
      ]);
    });

    it.each(UNSUPPORTED_LOCALES)(
      "answers in the default locale instead of %p",
      async (locale) => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
          validToken,
        );

        const result = await verifyEmailToken("token-1", locale);

        expect(result.success).toBe(true);
        expect(translateSuccess.mock.calls).toEqual([
          ["en", "success.emailVerified", "Email verified successfully"],
        ]);
      },
    );

    it.each(UNSUPPORTED_LOCALES)(
      "refuses an unknown token in the default locale instead of %p",
      async (locale) => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

        const result = await verifyEmailToken("no-such-token", locale);

        expect(result.success).toBe(false);
        expect(translateError.mock.calls).toEqual([
          [
            "en",
            "errors.invalidVerificationToken",
            "Invalid verification token",
          ],
        ]);
      },
    );

    // What a client sends as an argument of a server action need not be a
    // string.
    it.each([[["de"]], [{ toString: () => "de" }], [42], [null]])(
      "answers in the default locale when the locale is %p, not a string",
      async (locale) => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
          validToken,
        );

        const result = await verifyEmailToken(
          "token-1",
          locale as unknown as string,
        );

        expect(result.success).toBe(true);
        expect(translateSuccess.mock.calls).toEqual([
          ["en", "success.emailVerified", "Email verified successfully"],
        ]);
      },
    );
  });
});
