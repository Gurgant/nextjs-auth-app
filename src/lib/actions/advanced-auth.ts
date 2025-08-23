"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
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
  validateBackupCode,
  encryptBackupCodes,
  generateNewBackupCodes,
  isValidTOTPFormat,
  isValidBackupCodeFormat,
  type TwoFactorSetup,
} from "@/lib/two-factor";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createValidationErrorResponse,
  createFieldErrorResponse,
  createGenericErrorResponse,
  logActionError,
  type ActionResponse,
} from "@/lib/utils/form-responses";
import { resolveFormLocale } from "@/lib/utils/form-locale-enhanced";
import {
  createErrorResponseI18n,
  createSuccessResponseI18n,
  createFieldErrorResponseI18n,
} from "@/lib/utils/form-responses-i18n";

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

// Email Verification Actions
// TODO: Future feature - Email verification form validation
// const emailVerificationSchema = z.object({
//   email: z.string().email('Invalid email address'),
// })

export async function sendEmailVerification(
  userEmail: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
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
  userId: string,
  linkType: "google" | "email",
  locale: string = "en",
): Promise<ActionResult> {
  try {
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
    const updateData: any = {};
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
  userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
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

    // TODO: Store encrypted backup codes when implementing persistent storage
    // const encryptedBackupCodes = encryptBackupCodes(twoFactorSetup.backupCodes)

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
  userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
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

    // Import validation functions
    const {
      getCurrentTOTPCode,
      isValidSecret,
      diagnoseTOTPIssue,
      checkTimeSynchronization,
      validateTOTPCodeWithLargeTolerance,
    } = await import("@/lib/two-factor");

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
    let isValidCode = validateTOTPCode(validatedData.verificationCode, secret);

    // If standard validation fails, try with large tolerance
    if (!isValidCode) {
      isValidCode = validateTOTPCodeWithLargeTolerance(
        validatedData.verificationCode,
        secret,
      );
    }

    if (!isValidCode) {
      // Run comprehensive diagnosis
      const diagnosis = diagnoseTOTPIssue(
        secret,
        validatedData.verificationCode,
      );
      console.log("🔍 TOTP Diagnosis for debugging:", diagnosis); // Debug logging
      const timeCheck = checkTimeSynchronization();
      const currentCode = getCurrentTOTPCode(secret);

      // Build detailed error message
      let detailedMessage = `Invalid verification code.\n\n`;
      detailedMessage += `• Expected current code: ${currentCode}\n`;
      detailedMessage += `• Your code: ${validatedData.verificationCode}\n`;
      detailedMessage += `• Server time: ${timeCheck.serverTime}\n`;
      detailedMessage += `• Next code in: ${timeCheck.nextCodeIn} seconds\n\n`;
      detailedMessage += `${timeCheck.recommendation}\n\n`;
      detailedMessage += `Please:\n`;
      detailedMessage += `1. Check your device time is synchronized\n`;
      detailedMessage += `2. Wait for a fresh code (codes change every 30 seconds)\n`;
      detailedMessage += `3. Enter the current code from your authenticator app`;

      // TODO: Consider translating this detailed technical message
      return createFieldErrorResponse(
        detailedMessage,
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

const verify2FASchema = z.object({
  code: z.string().min(6).max(8),
  useBackupCode: z.boolean().optional(),
});

export async function verifyTwoFactorCode(
  formData: FormData,
  userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const data = {
      code: formData.get("code") as string,
      useBackupCode: formData.get("useBackupCode") === "true",
    };

    const validatedData = verify2FASchema.parse(data);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        backupCodes: true,
      },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return await createErrorResponseI18n(
        "errors.twoFactorNotEnabled",
        locale,
        "2FA is not enabled for this user",
      );
    }

    let isValid = false;
    let updatedBackupCodes = user.backupCodes;

    if (validatedData.useBackupCode) {
      // Validate backup code
      if (!isValidBackupCodeFormat(validatedData.code)) {
        return await createErrorResponseI18n(
          "errors.invalidBackupCodeFormat",
          locale,
          "Invalid backup code format",
        );
      }

      const result = validateBackupCode(validatedData.code, user.backupCodes);
      isValid = result.valid;
      updatedBackupCodes = result.remainingCodes;

      if (isValid) {
        // Update user's backup codes (remove used code)
        await prisma.user.update({
          where: { id: userId },
          data: { backupCodes: updatedBackupCodes },
        });
      }
    } else {
      // Validate TOTP code
      if (!isValidTOTPFormat(validatedData.code)) {
        return await createErrorResponseI18n(
          "errors.invalidVerificationCodeFormat",
          locale,
          "Invalid verification code format",
        );
      }

      const secret = decrypt(user.twoFactorSecret);
      isValid = validateTOTPCode(validatedData.code, secret);
    }

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId,
      eventType: isValid ? "2fa_verified" : "2fa_failed",
      details: isValid
        ? `2FA verified using ${validatedData.useBackupCode ? "backup code" : "TOTP"}`
        : `2FA verification failed using ${validatedData.useBackupCode ? "backup code" : "TOTP"}`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
      success: isValid,
    });

    if (isValid) {
      return await createSuccessResponseI18n(
        "success.twoFactorVerified",
        locale,
        "2FA verified successfully",
        {
          remainingBackupCodes: updatedBackupCodes.length,
        },
      );
    } else {
      return await createErrorResponseI18n(
        "errors.invalidVerificationCode",
        locale,
        "Invalid verification code",
      );
    }
  } catch (error) {
    logActionError("verifyTwoFactorCode", error);

    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    return await createErrorResponseI18n(
      "errors.failedToVerifyTwoFactorCode",
      locale,
      "Failed to verify 2FA code",
    );
  }
}

export async function disableTwoFactorAuth(
  userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
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
  userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
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
      (account: any) => account.provider === "google",
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

// Get security events for user
export async function getUserSecurityEvents(
  userId: string,
  limit: number = 20,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        details: true,
        ipAddress: true,
        success: true,
        createdAt: true,
      },
    });

    return await createSuccessResponseI18n(
      "success.securityEventsRetrieved",
      locale,
      "Security events retrieved successfully",
      events,
    );
  } catch (error) {
    logActionError("getUserSecurityEvents", error);
    return await createErrorResponseI18n(
      "errors.failedToFetchSecurityEvents",
      locale,
      "Failed to fetch security events",
    );
  }
}

// Complete 2FA authentication after successful verification
export async function complete2FAAuthentication(
  userId: string,
  locale: string = "en",
): Promise<ActionResult> {
  try {
    // Verify the temporary session exists
    if (!global.tempAuth2FA?.has(userId)) {
      return await createErrorResponseI18n(
        "errors.invalidAuthenticationSession",
        locale,
        "Invalid or expired authentication session",
      );
    }

    const tempSession = global.tempAuth2FA.get(userId);

    if (!tempSession) {
      return await createErrorResponseI18n(
        "errors.invalidAuthenticationSession",
        locale,
        "Invalid authentication session",
      );
    }

    // Check if session is not too old (5 minutes max)
    if (Date.now() - tempSession.timestamp > 5 * 60 * 1000) {
      global.tempAuth2FA.delete(userId);
      return await createErrorResponseI18n(
        "errors.authenticationSessionExpired",
        locale,
        "Authentication session expired",
      );
    }

    // Update user's last login and 2FA verification time
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });

    // Log successful 2FA verification
    const headersList = await headers();
    await logSecurityEvent({
      userId,
      eventType: "2fa_verified",
      details: "Two-factor authentication verified successfully during login",
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get("user-agent") || undefined,
      success: true,
    });

    // Clean up temporary session
    global.tempAuth2FA.delete(userId);

    return await createSuccessResponseI18n(
      "success.twoFactorAuthCompleted",
      locale,
      "2FA authentication completed successfully",
      {
        userId,
        provider: "credentials", // Default provider since tempSession doesn't have provider
      },
    );
  } catch (error) {
    logActionError("complete2FAAuthentication", error);
    return await createErrorResponseI18n(
      "errors.failedToCompleteTwoFactorAuth",
      locale,
      "Failed to complete 2FA authentication",
    );
  }
}
