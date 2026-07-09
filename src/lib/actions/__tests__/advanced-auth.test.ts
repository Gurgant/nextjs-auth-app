// Mock server translations FIRST before any other imports
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: jest
    .fn()
    .mockImplementation(
      async (locale: string, key: string, fallback?: string) => {
        // Return fallback message if provided, otherwise return a default English message based on key
        if (fallback) return fallback;

        const translations: Record<string, string> = {
          twoFactorAlreadyEnabled:
            "Two-factor authentication is already enabled",
          twoFactorNotEnabled: "Two-factor authentication is not enabled",
          failedToSetupTwoFactor: "Failed to setup two-factor authentication",
          failedToDisableTwoFactor:
            "Failed to disable two-factor authentication",
          failedToSendVerificationEmail: "Failed to send verification email",
          emailAlreadyVerified: "Email is already verified",
          failedToFetchAccountInfo: "Failed to fetch account information",
        };

        return translations[key] || key;
      },
    ),
  translateSuccess: jest
    .fn()
    .mockImplementation(
      async (locale: string, key: string, fallback?: string) => {
        // Return fallback message if provided, otherwise return a default English message based on key
        if (fallback) return fallback;

        const translations: Record<string, string> = {
          twoFactorSetupInitiated: "2FA setup initiated",
          twoFactorDisabled: "2FA disabled successfully",
          verificationEmailSent: "Verification email sent successfully",
          accountInfoRetrieved: "Account information retrieved successfully",
        };

        return translations[key] || key;
      },
    ),
  translateCommonError: jest
    .fn()
    .mockImplementation(async (locale: string, type: string) => {
      const commonErrors: Record<string, string> = {
        notFound: "User not found",
        serverError: "An error occurred on the server",
        unknown: "Something went wrong. Please try again.",
      };
      return commonErrors[type] || "An error occurred";
    }),
}));

import {
  getEnhancedUserAccountInfo,
  setupTwoFactorAuth,
  disableTwoFactorAuth,
  sendEmailVerification,
} from "../advanced-auth";
import { prisma } from "@/lib/prisma";

// Mock Next.js headers
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(
    new Map([
      ["user-agent", "test-user-agent"],
      ["x-forwarded-for", "127.0.0.1"],
    ]),
  ),
}));

// Mock other dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/security");
jest.mock("@/lib/email");
jest.mock("@/lib/two-factor");

// Get the mocked prisma
const { prisma: mockPrisma } = require("@/lib/prisma");

// Mock implementations for security functions
require("@/lib/security").generateSecureToken = jest
  .fn()
  .mockReturnValue("mock-secure-token");
require("@/lib/security").encrypt = jest.fn().mockReturnValue("encrypted-data");
require("@/lib/security").decrypt = jest.fn().mockReturnValue("decrypted-data");
require("@/lib/security").logSecurityEvent = jest
  .fn()
  .mockResolvedValue(undefined);
require("@/lib/security").getClientIP = jest.fn().mockReturnValue("127.0.0.1");

// Mock implementations for email functions
require("@/lib/email").sendVerificationEmail = jest
  .fn()
  .mockResolvedValue(true);
require("@/lib/email").sendAccountLinkConfirmation = jest
  .fn()
  .mockResolvedValue(true);
require("@/lib/email").sendSecurityAlert = jest.fn().mockResolvedValue(true);

// Mock implementations for two-factor functions
require("@/lib/two-factor").setupTwoFactor = jest.fn().mockResolvedValue({
  secret: "JBSWY3DPEHPK3PXP",
  qrCodeUrl: "otpauth://totp/TestApp?secret=JBSWY3DPEHPK3PXP",
  backupCodes: ["backup1", "backup2"],
});
require("@/lib/two-factor").validateTOTPCode = jest.fn().mockReturnValue(true);
require("@/lib/two-factor").validateBackupCode = jest
  .fn()
  .mockReturnValue({ valid: true, remainingCodes: [] });
require("@/lib/two-factor").encryptBackupCodes = jest
  .fn()
  .mockReturnValue(["encrypted1", "encrypted2"]);
require("@/lib/two-factor").generateNewBackupCodes = jest
  .fn()
  .mockReturnValue(["new1", "new2"]);
require("@/lib/two-factor").isValidTOTPFormat = jest.fn().mockReturnValue(true);
require("@/lib/two-factor").isValidBackupCodeFormat = jest
  .fn()
  .mockReturnValue(true);

describe("Advanced Authentication Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getEnhancedUserAccountInfo", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      password: "hashed-password",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      accounts: [
        {
          provider: "google",
          type: "oauth",
        },
      ],
    };

    it("should return enhanced user account info successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getEnhancedUserAccountInfo("user-123", "en");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(
          expect.objectContaining({
            id: "user-123",
            email: "test@example.com",
            hasGoogleAccount: true,
            hasPassword: true,
            hasEmailAccount: true,
            twoFactorEnabled: false,
            backupCodesCount: 0,
            accounts: [
              {
                provider: "google",
                type: "oauth",
              },
            ],
          }),
        );
      }

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        include: {
          accounts: {
            select: {
              provider: true,
              type: true,
            },
          },
        },
      });
    });

    it("should return error when user not found in database", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await getEnhancedUserAccountInfo("user-123", "en");

      expect(result.success).toBe(false);
      expect(result.message).toBe("User not found");
    });

    it("should handle database errors gracefully", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("Database error"));

      const result = await getEnhancedUserAccountInfo("user-123", "en");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to fetch account information");
    });

    it("should correctly detect account types", async () => {
      // Test user with no password and no Google account
      const userWithoutPassword = {
        ...mockUser,
        password: null,
        accounts: [], // No accounts
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithoutPassword);

      const result = await getEnhancedUserAccountInfo("user-123", "en");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(
          expect.objectContaining({
            hasGoogleAccount: false,
            hasPassword: false,
            hasEmailAccount: false,
          }),
        );
      }
    });

    it("should count backup codes correctly", async () => {
      const userWithBackupCodes = {
        ...mockUser,
        backupCodes: ["code1", "code2", "code3"],
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithBackupCodes);

      const result = await getEnhancedUserAccountInfo("user-123", "en");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.backupCodesCount).toBe(3);
      }
    });
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
          twoFactorEnabledAt: null,
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
  });
});
