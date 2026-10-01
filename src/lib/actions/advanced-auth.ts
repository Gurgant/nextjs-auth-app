"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { auth } from "@/lib/auth";
import { recordAttempt, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateSecureToken,
  encrypt,
  decrypt,
  logSecurityEvent,
  getClientIP,
} from "@/lib/security";
import {
  sendVerificationEmail,
  sendAccountLinkConfirmation,
  sendSecurityAlert,
} from "@/lib/email";
import {
  setupTwoFactor,
  validateTOTPCode,
  encryptBackupCodes,
  generateNewBackupCodes,
  type TwoFactorSetup,
} from "@/lib/two-factor";
import { headers } from "next/headers";

import {
  createValidationErrorResponse,
  createFieldErrorResponse,
  createGenericErrorResponse,
  logActionError,
  type ActionResponse,
} from "@/lib/utils/form-responses";
import { resolveFormLocale } from "@/lib/utils/form-locale-server";
import {
  createErrorResponseI18n,
  createSuccessResponseI18n,
  createFieldErrorResponseI18n,
} from "@/lib/utils/form-responses-i18n";

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

// All account-scoped actions below derive the acting user from the session —
// never from a client-supplied id — so a caller can only ever act on their own
// account (prevents IDOR / privilege escalation). The `_userId` parameters are
// kept for call-site compatibility but intentionally ignored.
async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// Email Verification Actions
export async function sendEmailVerification(
  userEmail: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    // Anti mail-bombing: throttle verification sends per email + IP. Counted
    // before any user lookup so it stays uniform whether or not the email exists.
    const rlHeaders = await headers();
    if (
      recordAttempt(
        "email-verify",
        [userEmail.toLowerCase(), getClientIP(rlHeaders)],
        RATE_LIMITS.emailVerify,
      ).blocked
    ) {
      return {
        success: false,
        message:
          "Too many verification emails requested. Please try again in a few minutes.",
      };
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true, email: true, emailVerified: true },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    if (user.emailVerified) {
      return await createErrorResponseI18n(
        "errors.emailAlreadyVerified",
        locale,
        "Email is already verified",
      );
    }

    // Generate verification token
    const token = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Create verification token in database
    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        email: user.email,
        expires: expiresAt,
      },
    });

    // Send verification email
    const emailSent = await sendVerificationEmail(
      user.email,
      user.name || "",
      token,
      locale,
    );

    if (!emailSent) {
      return await createErrorResponseI18n(
        "errors.failedToSendVerificationEmail",
        locale,
        "Failed to send verification email",
      );
    }

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId: user.id,
      eventType: "email_verified",
      details: "Email verification token sent",
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.verificationEmailSent",
      locale,
      "Verification email sent successfully",
    );
  } catch (error) {
    logActionError("sendEmailVerification", error);
    return await createErrorResponseI18n(
      "errors.failedToSendVerificationEmail",
      locale,
      "Failed to send verification email",
    );
  }
}

export async function verifyEmailToken(
  token: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    // Find verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken) {
      return await createErrorResponseI18n(
        "errors.invalidVerificationToken",
        locale,
        "Invalid verification token",
      );
    }

    if (verificationToken.used) {
      return await createErrorResponseI18n(
        "errors.verificationTokenUsed",
        locale,
        "Verification token has already been used",
      );
    }

    if (new Date() > verificationToken.expires) {
      return await createErrorResponseI18n(
        "errors.verificationTokenExpired",
        locale,
        "Verification token has expired",
      );
    }

    // Mark email as verified and token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: {
          emailVerified: new Date(),
          emailVerificationRequired: false,
        },
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true },
      }),
    ]);

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId: verificationToken.userId,
      eventType: "email_verified",
      details: "Email address verified successfully",
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.emailVerified",
      locale,
      "Email verified successfully",
    );
  } catch (error) {
    logActionError("verifyEmailToken", error);
    return await createErrorResponseI18n(
      "errors.failedToVerifyEmail",
      locale,
      "Failed to verify email",
    );
  }
}

// Account Linking Actions
export async function initiateAccountLinking(
  _userId: string,
  linkType: "google" | "email",
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return createGenericErrorResponse(
        "unauthorized",
        "You must be signed in.",
        locale,
      );
    }

    // Throttle link initiations (spam / confirmation-email bombing) per
    // account + IP.
    const rlHeaders = await headers();
    if (
      recordAttempt(
        "account-link",
        [userId, getClientIP(rlHeaders)],
        RATE_LIMITS.accountLink,
      ).blocked
    ) {
      return {
        success: false,
        message:
          "Too many linking requests. Please try again in a few minutes.",
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        hasGoogleAccount: true,
        hasEmailAccount: true,
      },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    // Check if linking is already in progress
    const existingRequest = await prisma.accountLinkRequest.findFirst({
      where: {
        userId,
        requestType: `link_${linkType}`,
        completed: false,
        expires: { gt: new Date() },
      },
    });

    if (existingRequest) {
      return await createErrorResponseI18n(
        "errors.accountLinkingInProgress",
        locale,
        "Account linking request already in progress",
      );
    }

    // Generate linking token
    const token = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create linking request
    await prisma.accountLinkRequest.create({
      data: {
        userId,
        requestType: `link_${linkType}`,
        token,
        expires: expiresAt,
        metadata: {
          initiatedAt: new Date().toISOString(),
          linkType,
        },
      },
    });

    // Send confirmation email
    const emailSent = await sendAccountLinkConfirmation(
      user.email,
      user.name || "",
      linkType,
      token,
      locale,
    );

    if (!emailSent) {
      return await createErrorResponseI18n(
        "errors.failedToSendConfirmationEmail",
        locale,
        "Failed to send confirmation email",
      );
    }

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId,
      eventType: "account_linked",
      details: `Account linking initiated for ${linkType}`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.confirmationEmailSent",
      locale,
      "Confirmation email sent. Please check your email to complete account linking.",
    );
  } catch (error) {
    logActionError("initiateAccountLinking", error);
    return await createErrorResponseI18n(
      "errors.failedToInitiateAccountLinking",
      locale,
      "Failed to initiate account linking",
    );
  }
}

export async function confirmAccountLinking(
  token: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const linkRequest = await prisma.accountLinkRequest.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!linkRequest) {
      return await createErrorResponseI18n(
        "errors.invalidLinkingToken",
        locale,
        "Invalid linking token",
      );
    }

    if (linkRequest.completed) {
      return await createErrorResponseI18n(
        "errors.accountLinkingCompleted",
        locale,
        "Account linking has already been completed",
      );
    }

    if (new Date() > linkRequest.expires) {
      return await createErrorResponseI18n(
        "errors.linkingTokenExpired",
        locale,
        "Linking token has expired",
      );
    }

    const linkType = linkRequest.requestType.replace("link_", "") as
      | "google"
      | "email";

    // Update user account linking status
    const updateData: Prisma.UserUpdateInput = {};
    if (linkType === "google") {
      updateData.hasGoogleAccount = true;
    } else if (linkType === "email") {
      updateData.hasEmailAccount = true;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: linkRequest.userId },
        data: updateData,
      }),
      prisma.accountLinkRequest.update({
        where: { id: linkRequest.id },
        data: { completed: true },
      }),
    ]);

    // Send security alert
    await sendSecurityAlert(
      linkRequest.user.email,
      linkRequest.user.name || "",
      "account_linked",
      `${linkType} account has been linked to your account`,
    );

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId: linkRequest.userId,
      eventType: "account_linked",
      details: `${linkType} account linked successfully`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.accountLinked",
      locale,
      "Account linked successfully",
    );
  } catch (error) {
    logActionError("confirmAccountLinking", error);
    return await createErrorResponseI18n(
      "errors.failedToConfirmAccountLinking",
      locale,
      "Failed to confirm account linking",
    );
  }
}

// Two-Factor Authentication Actions
export async function setupTwoFactorAuth(
  _userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return createGenericErrorResponse(
        "unauthorized",
        "You must be signed in.",
        locale,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    if (user.twoFactorEnabled) {
      return await createErrorResponseI18n(
        "errors.twoFactorAlreadyEnabled",
        locale,
        "Two-factor authentication is already enabled",
      );
    }

    // Setup 2FA
    const twoFactorSetup: TwoFactorSetup = await setupTwoFactor(user.email);

    // Encrypt and store the secret temporarily (will be saved when user confirms)
    const encryptedSecret = encrypt(twoFactorSetup.secret);

    // Backup codes are encrypted and persisted when the user confirms setup
    // (see enableTwoFactorAuth below).

    return await createSuccessResponseI18n(
      "success.twoFactorSetupInitiated",
      locale,
      "2FA setup initiated",
      {
        qrCodeUrl: twoFactorSetup.qrCodeUrl,
        backupCodes: twoFactorSetup.backupCodes,
        secret: encryptedSecret, // Send encrypted secret to verify setup
        manualEntrySecret: twoFactorSetup.secret, // For manual entry
      },
    );
  } catch (error) {
    logActionError("setupTwoFactorAuth", error);
    return await createErrorResponseI18n(
      "errors.failedToSetupTwoFactor",
      locale,
      "Failed to setup two-factor authentication",
    );
  }
}

const enable2FASchema = z.object({
  encryptedSecret: z.string(),
  verificationCode: z.string().min(6).max(6),
});

export async function enableTwoFactorAuth(
  formData: FormData,
  _userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return createGenericErrorResponse(
        "unauthorized",
        "You must be signed in.",
        locale,
      );
    }

    const data = {
      encryptedSecret: formData.get("encryptedSecret")?.toString() || "",
      verificationCode: formData.get("verificationCode")?.toString() || "",
    };

    const validatedData = enable2FASchema.parse(data);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, twoFactorEnabled: true },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    if (user.twoFactorEnabled) {
      return await createErrorResponseI18n(
        "errors.twoFactorAlreadyEnabled",
        locale,
        "2FA is already enabled",
      );
    }

    // Decrypt secret and validate code
    let secret: string;
    try {
      // Test if the encrypted secret is valid format
      if (
        !validatedData.encryptedSecret ||
        validatedData.encryptedSecret.length < 10
      ) {
        return await createFieldErrorResponseI18n(
          "errors.invalidSecret",
          "verificationCode",
          locale,
          "Invalid encrypted secret format. Please try setting up 2FA again.",
        );
      }

      secret = decrypt(validatedData.encryptedSecret);

      // Additional validation - check if decrypted secret is empty
      if (!secret || secret.length === 0) {
        return await createFieldErrorResponseI18n(
          "errors.emptySecret",
          "verificationCode",
          locale,
          "Decrypted secret is empty. Please try setting up 2FA again.",
        );
      }
    } catch {
      return await createFieldErrorResponseI18n(
        "errors.secretDecryptionFailed",
        "verificationCode",
        locale,
        "Failed to decrypt 2FA secret. Please try setting up 2FA again.",
      );
    }

    // Import validation helper
    const { isValidSecret } = await import("@/lib/two-factor");

    // Validate secret format
    if (!isValidSecret(secret)) {
      return await createFieldErrorResponseI18n(
        "errors.invalidSecretFormat",
        "verificationCode",
        locale,
        "Invalid 2FA secret format. Please set up 2FA again.",
      );
    }

    // Validate the provided TOTP code
    const isValidCode = validateTOTPCode(
      validatedData.verificationCode,
      secret,
    );

    if (!isValidCode) {
      // Generic error only — never disclose the expected code, server time, or
      // rotation timing (that would hand an attacker the valid 2FA code).
      return createFieldErrorResponse(
        "Invalid verification code. Enter the current 6-digit code from your authenticator app.",
        "verificationCode",
        "Invalid verification code",
      );
    }

    // Generate backup codes and enable 2FA
    const backupCodes = generateNewBackupCodes();
    const encryptedBackupCodes = encryptBackupCodes(backupCodes);

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: validatedData.encryptedSecret, // Already encrypted
        backupCodes: encryptedBackupCodes,
        twoFactorEnabledAt: new Date(),
      },
    });

    // Send security alert
    await sendSecurityAlert(
      user.email,
      user.name || "",
      "2fa_enabled",
      "Two-factor authentication has been enabled on your account",
    );

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId,
      eventType: "2fa_enabled",
      details: "Two-factor authentication enabled",
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.twoFactorEnabled",
      locale,
      "2FA enabled successfully",
      { backupCodes },
    );
  } catch (error) {
    logActionError("enableTwoFactorAuth", error);

    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    return await createErrorResponseI18n(
      "errors.failedToEnableTwoFactor",
      locale,
      "Failed to enable 2FA",
    );
  }
}

export async function disableTwoFactorAuth(
  _userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return createGenericErrorResponse(
        "unauthorized",
        "You must be signed in.",
        locale,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, twoFactorEnabled: true },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    if (!user.twoFactorEnabled) {
      return await createErrorResponseI18n(
        "errors.twoFactorNotEnabled",
        locale,
        "2FA is not enabled",
      );
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        twoFactorEnabledAt: null,
      },
    });

    // Send security alert
    await sendSecurityAlert(
      user.email,
      user.name || "",
      "2fa_enabled", // Reuse template but with different message
      "Two-factor authentication has been disabled on your account",
    );

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId,
      eventType: "2fa_disabled",
      details: "Two-factor authentication disabled",
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
    });

    return await createSuccessResponseI18n(
      "success.twoFactorDisabled",
      locale,
      "2FA disabled successfully",
    );
  } catch (error) {
    logActionError("disableTwoFactorAuth", error);
    return await createErrorResponseI18n(
      "errors.failedToDisableTwoFactor",
      locale,
      "Failed to disable 2FA",
    );
  }
}

// Get comprehensive user account information including verification status
export async function getEnhancedUserAccountInfo(
  _userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return createGenericErrorResponse(
        "unauthorized",
        "You must be signed in.",
        locale,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            provider: true,
            type: true,
          },
        },
      },
    });

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    const hasGoogleAccount = user.accounts.some(
      (account) => account.provider === "google",
    );
    const hasPassword = !!user.password;

    return await createSuccessResponseI18n(
      "accountInfoRetrieved",
      locale,
      "Account information retrieved successfully",
      {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        emailVerificationRequired: user.emailVerificationRequired,
        hasGoogleAccount,
        hasPassword,
        hasEmailAccount: hasPassword,
        primaryAuthMethod: user.primaryAuthMethod,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        backupCodesCount: user.backupCodes.length,
        passwordSetAt: user.passwordSetAt,
        lastPasswordChange: user.lastPasswordChange,
        lastLoginAt: user.lastLoginAt,
        accounts: user.accounts,
        createdAt: user.createdAt,
      },
    );
  } catch (error) {
    logActionError("getEnhancedUserAccountInfo", error);
    return await createErrorResponseI18n(
      "errors.failedToFetchAccountInfo",
      locale,
      "Failed to fetch account information",
    );
  }
}
