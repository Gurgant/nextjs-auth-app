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
      updateMany: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    const VERIFIED_AT = new Date("2026-01-01T10:00:00Z");
    const validToken = {
      id: "token-row-1",
      userId: "user-123",
      used: false,
      expires: new Date(Date.now() + 30 * 60 * 1000),
      user: { emailVerified: null },
    };
    const usedToken = { ...validToken, used: true };
    const expiredToken = { ...validToken, expires: new Date(Date.now() - 1) };
    const ofVerifiedUser = { user: { emailVerified: VERIFIED_AT } };
    const { logSecurityEvent } = require("@/lib/security");
    const ALREADY_VERIFIED = {
      success: true,
      message: "Email is already verified",
      data: { alreadyVerified: true },
    };
    const TOKEN_USED = {
      success: false,
      message: "Verification token has already been used",
    };

    beforeEach(() => {
      // The transaction hands its function a client: here the mocked one. A
      // list of writes, the other form of a transaction, is awaited as it is.
      mockPrisma.$transaction.mockImplementation(
        async (work: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
          typeof work === "function" ? work(mockPrisma) : Promise.all(work),
      );
      // Each of the two writes finds its row, unless a test says otherwise.
      mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    });

    /** The user row is not written, by neither form of an update. */
    const expectUserRowNotWritten = () => {
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    };

    /** Nothing is written: not the user row, not the token, not an event. */
    const expectNothingWritten = () => {
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expectUserRowNotWritten();
      expect(mockPrisma.emailVerificationToken.update).not.toHaveBeenCalled();
      expect(
        mockPrisma.emailVerificationToken.updateMany,
      ).not.toHaveBeenCalled();
      expect(logSecurityEvent).not.toHaveBeenCalled();
    };

    it("verifies the e-mail of the owner of the token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
        validToken,
      );

      const result = await verifyEmailToken("token-1", "en");

      expect(result).toEqual({
        success: true,
        message: "Email verified successfully",
        data: { alreadyVerified: false },
      });
      // Of the user row only the verification date is read.
      expect(mockPrisma.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        {
          where: { token: "token-1" },
          include: { user: { select: { emailVerified: true } } },
        },
      );
      // Both writes carry their condition: the token only while it is unused,
      // the address only while it is not verified.
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.emailVerificationToken.updateMany.mock.calls).toEqual([
        [{ where: { id: "token-row-1", used: false }, data: { used: true } }],
      ]);
      expect(mockPrisma.user.updateMany.mock.calls).toEqual([
        [
          {
            where: { id: "user-123", emailVerified: null },
            data: { emailVerified: expect.any(Date) },
          },
        ],
      ]);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.emailVerificationToken.update).not.toHaveBeenCalled();
      expect(logSecurityEvent).toHaveBeenCalledTimes(1);
      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          eventType: "email_verified",
          details: "Email address verified successfully",
        }),
      );
    });

    // Two e-mails were requested and both links are followed, or the address
    // was verified by a Google sign-in: the token is unused and has not
    // expired, and the write to the user row finds no row that is not
    // verified.
    describe("an unused token of an address that is already verified", () => {
      beforeEach(() => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...validToken,
          ...ofVerifiedUser,
        });
        mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
      });

      it("answers that the address is already verified and records no event", async () => {
        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual(ALREADY_VERIFIED);
        expect(logSecurityEvent).not.toHaveBeenCalled();
      });

      // The one write to the user row is the conditional one, which the
      // database answers with no row.
      it("uses the token up and leaves the user row to the condition", async () => {
        await verifyEmailToken("token-1", "en");

        expect(mockPrisma.emailVerificationToken.updateMany.mock.calls).toEqual(
          [
            [
              {
                where: { id: "token-row-1", used: false },
                data: { used: true },
              },
            ],
          ],
        );
        expect(mockPrisma.user.updateMany.mock.calls).toEqual([
          [
            {
              where: { id: "user-123", emailVerified: null },
              data: { emailVerified: expect.any(Date) },
            },
          ],
        ]);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it("answers in the locale of the request", async () => {
        await verifyEmailToken("token-1", "de");

        expect(translateError.mock.calls).toEqual([
          ["de", "errors.emailAlreadyVerified", "Email is already verified"],
        ]);
        expect(translateSuccess).not.toHaveBeenCalled();
      });
    });

    // Two requests arrive together: both find the token unused, and the
    // database lets one of them claim it.
    describe("a token that another request used after the lookup", () => {
      beforeEach(() => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
          validToken,
        );
        mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({
          count: 0,
        });
      });

      it("answers that the address is already verified, and writes neither the user row nor an event", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          emailVerified: VERIFIED_AT,
        });

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual(ALREADY_VERIFIED);
        expect(mockPrisma.user.findUnique.mock.calls).toEqual([
          [{ where: { id: "user-123" }, select: { emailVerified: true } }],
        ]);
        expectUserRowNotWritten();
        expect(logSecurityEvent).not.toHaveBeenCalled();
      });

      // As for a token found used: no path of the app leaves this state.
      it.each([
        ["is not verified", { emailVerified: null }],
        ["has no row any more", null],
      ])("keeps the failure when the address %s", async (_case, owner) => {
        mockPrisma.user.findUnique.mockResolvedValue(owner);

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual(TOKEN_USED);
        expectUserRowNotWritten();
        expect(logSecurityEvent).not.toHaveBeenCalled();
      });
    });

    it("answers a failed transaction with the generic failure and records no event", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
        validToken,
      );
      mockPrisma.$transaction.mockRejectedValue(
        new Error("connect ECONNREFUSED db.internal:5432"),
      );

      const result = await verifyEmailToken("token-1", "en");

      expect(result).toEqual({
        success: false,
        message: "Failed to verify email",
      });
      expect(logSecurityEvent).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("should return error when the token is unknown", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      const result = await verifyEmailToken("no-such-token", "en");

      expect(result).toEqual({
        success: false,
        message: "Invalid verification token",
      });
      expectNothingWritten();
    });

    // The page that calls the action verifies while it renders a GET, and the
    // token works once. The same address is requested again on a reload, on a
    // change of language, and by the user after a mail scanner opened the
    // link: the second request finds a used token.
    describe("a token that was already used", () => {
      it("answers that the address is already verified when it is, and writes nothing", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...usedToken,
          ...ofVerifiedUser,
        });

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual(ALREADY_VERIFIED);
        expectNothingWritten();
      });

      it("answers the same every time it is asked again", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...usedToken,
          ...ofVerifiedUser,
        });

        const answers = [
          await verifyEmailToken("token-1", "en"),
          await verifyEmailToken("token-1", "en"),
          await verifyEmailToken("token-1", "en"),
        ];

        expect(answers).toEqual([
          ALREADY_VERIFIED,
          ALREADY_VERIFIED,
          ALREADY_VERIFIED,
        ]);
        expectNothingWritten();
      });

      // A used token is not asked for its expiry: the address stays verified
      // after the 30 minutes.
      it("answers that the address is already verified after the token has expired as well", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...usedToken,
          expires: expiredToken.expires,
          ...ofVerifiedUser,
        });

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toMatchObject({
          success: true,
          data: { alreadyVerified: true },
        });
        expectNothingWritten();
      });

      // No path of the app clears a verification date; a row changed in the
      // database can look like this.
      it("keeps the failure when the address is not verified", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
          usedToken,
        );

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual(TOKEN_USED);
        expectNothingWritten();
      });

      it("answers in the locale of the request", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...usedToken,
          ...ofVerifiedUser,
        });

        await verifyEmailToken("token-1", "de");

        expect(translateError.mock.calls).toEqual([
          ["de", "errors.emailAlreadyVerified", "Email is already verified"],
        ]);
        expect(translateSuccess).not.toHaveBeenCalled();
      });
    });

    describe("a token that has expired without being used", () => {
      it("keeps the failure", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(
          expiredToken,
        );

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual({
          success: false,
          message: "Verification token has expired",
        });
        expectNothingWritten();
      });

      // Verified through another link, or by a Google sign-in.
      it("keeps the failure when the address is verified", async () => {
        mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
          ...expiredToken,
          ...ofVerifiedUser,
        });

        const result = await verifyEmailToken("token-1", "en");

        expect(result).toEqual({
          success: false,
          message: "Verification token has expired",
        });
        expectNothingWritten();
      });
    });

    it("answers a failed lookup with the generic failure", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrisma.emailVerificationToken.findUnique.mockRejectedValue(
        new Error("connect ECONNREFUSED db.internal:5432"),
      );

      const result = await verifyEmailToken("token-1", "en");

      expect(result).toEqual({
        success: false,
        message: "Failed to verify email",
      });
      expectNothingWritten();
      errorSpy.mockRestore();
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
