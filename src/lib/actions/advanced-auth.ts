"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSafeLocale, type Locale } from "@/config/i18n";
import { recordAttempt, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateSecureToken,
  encrypt,
  decrypt,
  logSecurityEvent,
  getClientIP,
  requestMetadata,
} from "@/lib/security";
import { sendVerificationEmail, sendSecurityAlert } from "@/lib/email";
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
  logActionError,
  type ActionResponse,
  type ErrorResponse,
  type SuccessResponse,
} from "@/lib/utils/form-responses";
import { resolveFormLocale } from "@/lib/utils/form-locale-server";
import {
  createErrorResponseI18n,
  createSuccessResponseI18n,
  createFieldErrorResponseI18n,
} from "@/lib/utils/form-responses-i18n";
import {
  translateError,
  translateSuccess,
} from "@/lib/utils/server-translations";
import { emailRateLimitKey } from "./rate-limit-key";

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

// What verifyEmailToken answers. A success says whether this request verified
// the address or found it verified: the page has a screen for each.
type VerifyEmailResult =
  | ErrorResponse
  | (SuccessResponse & { data: { alreadyVerified: boolean } });

// All account-scoped actions below derive the acting user from the session —
// never from a client-supplied id — so a caller can only ever act on their own
// account (prevents IDOR / privilege escalation). The `_userId` parameters are
// kept for call-site compatibility but intentionally ignored.
async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// What verifyEmailToken answers for a token that is used up. When the address
// is verified, that is the answer, in the words sendEmailVerification has for
// it. It tells whoever holds the token no more than that: no address, no
// name, and it opens no session.
async function answerUsedToken(
  addressVerified: boolean,
  locale: Locale,
): Promise<VerifyEmailResult> {
  if (addressVerified) {
    return {
      success: true,
      message: await translateError(
        locale,
        "errors.emailAlreadyVerified",
        "Email is already verified",
      ),
      data: { alreadyVerified: true },
    };
  }

  return await createErrorResponseI18n(
    "errors.verificationTokenUsed",
    locale,
    "Verification token has already been used",
  );
}

// Email Verification Actions
export async function sendEmailVerification(
  userEmail: string,
  requestedLocale: string = "en",
): Promise<ActionResult> {
  // No session is needed and the locale goes into the e-mailed link: only a
  // supported one is accepted, anything else falls back to the default.
  const locale = getSafeLocale(requestedLocale);

  try {
    // Anti mail-bombing: throttle verification sends per email + IP. Counted
    // before any user lookup so it stays uniform whether or not the email exists.
    // Nothing validates the address: its key is bounded where it is built.
    const rlHeaders = await headers();
    if (
      recordAttempt(
        "email-verify",
        [emailRateLimitKey(userEmail), getClientIP(rlHeaders)],
        RATE_LIMITS.emailVerify,
      ).blocked
    ) {
      return await createErrorResponseI18n(
        "errors.tooManyVerificationEmails",
        locale,
        "Too many verification emails requested. Please try again in a few minutes.",
      );
    }

    // Find user. The argument is whatever the client sent: a value that is no
    // text is the address of no user.
    const user =
      typeof userEmail === "string"
        ? await prisma.user.findUnique({
            where: { email: userEmail },
            select: { id: true, name: true, email: true, emailVerified: true },
          })
        : null;

    if (!user) {
      return await createErrorResponseI18n(
        "errors.userNotFound",
        locale,
        "User not found",
      );
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
      ...requestMetadata(headersList),
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
  requestedLocale: string = "en",
): Promise<VerifyEmailResult> {
  // As in sendEmailVerification: no session is needed, and only a supported
  // locale is accepted.
  const locale = getSafeLocale(requestedLocale);

  try {
    // Find verification token. Of its user only the verification date is read.
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: { select: { emailVerified: true } } },
    });

    if (!verificationToken) {
      return await createErrorResponseI18n(
        "errors.invalidVerificationToken",
        locale,
        "Invalid verification token",
      );
    }

    if (verificationToken.used) {
      // The token works once, and the page that verifies it does so while it
      // renders: the same address is requested again on a reload, on a change
      // of language, and by the user after a mail scanner opened the link.
      // Nothing is written and no second event is recorded.
      return await answerUsedToken(
        verificationToken.user.emailVerified !== null,
        locale,
      );
    }

    if (new Date() > verificationToken.expires) {
      return await createErrorResponseI18n(
        "errors.verificationTokenExpired",
        locale,
        "Verification token has expired",
      );
    }

    // Mark the token as used and the email as verified. Both writes carry
    // their condition into the database: the token is claimed only while it
    // is unused, and the address is verified only while it is not. So of the
    // requests that arrive together (one link twice, or two links of one
    // user) one verifies, and the others answer as a used token does. A link
    // of an address that is already verified (a second e-mail, a Google
    // sign-in) is used up without a write to the user row.
    const outcome = await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: verificationToken.id, used: false },
        data: { used: true },
      });
      if (claimed.count === 0) {
        // Another request used the token after the lookup above.
        const owner = await tx.user.findUnique({
          where: { id: verificationToken.userId },
          select: { emailVerified: true },
        });
        return owner?.emailVerified ? "alreadyVerified" : "tokenUsed";
      }

      const verified = await tx.user.updateMany({
        where: { id: verificationToken.userId, emailVerified: null },
        data: { emailVerified: new Date() },
      });
      return verified.count === 0 ? "alreadyVerified" : "verified";
    });

    if (outcome !== "verified") {
      return await answerUsedToken(outcome === "alreadyVerified", locale);
    }

    // Log security event
    const headersList = await headers();
    await logSecurityEvent({
      userId: verificationToken.userId,
      eventType: "email_verified",
      details: "Email address verified successfully",
      ...requestMetadata(headersList),
    });

    return {
      success: true,
      message: await translateSuccess(
        locale,
        "success.emailVerified",
        "Email verified successfully",
      ),
      data: { alreadyVerified: false },
    };
  } catch (error) {
    logActionError("verifyEmailToken", error);
    return await createErrorResponseI18n(
      "errors.failedToVerifyEmail",
      locale,
      "Failed to verify email",
    );
  }
}

// Two-Factor Authentication Actions
export async function setupTwoFactorAuth(
  _userId: string,
  requestedLocale: string = "en",
): Promise<ActionResult> {
  // The locale is an argument the client sends: only a supported one is
  // accepted, anything else falls back to the default.
  const locale = getSafeLocale(requestedLocale);

  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true },
    });

    if (!user) {
      return await createErrorResponseI18n(
        "errors.userNotFound",
        locale,
        "User not found",
      );
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
      "Failed to set up two-factor authentication",
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
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in.",
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
      return await createErrorResponseI18n(
        "errors.userNotFound",
        locale,
        "User not found",
      );
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
      return await createFieldErrorResponseI18n(
        "errors.invalidVerificationCode",
        "verificationCode",
        locale,
        "Invalid verification code. Enter the current 6-digit code from your authenticator app.",
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
      ...requestMetadata(headersList),
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
  requestedLocale: string = "en",
): Promise<ActionResult> {
  // As in setupTwoFactorAuth: only a supported locale is accepted.
  const locale = getSafeLocale(requestedLocale);

  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, twoFactorEnabled: true },
    });

    if (!user) {
      return await createErrorResponseI18n(
        "errors.userNotFound",
        locale,
        "User not found",
      );
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
      ...requestMetadata(headersList),
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
