"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { repositories } from "@/lib/repositories";
import { headers } from "next/headers";
import { getClientIP } from "@/lib/security";
import { recordAttempt, RATE_LIMITS } from "@/lib/rate-limit";
import {
  commandBus,
  RegisterUserCommand,
  ChangePasswordCommand,
} from "@/lib/commands";
import { auth } from "@/lib/auth";
import {
  emailSchema,
  passwordSchema,
  passwordMatchRefinement,
  emailMatchRefinement,
} from "@/lib/validation";
import { resolveFormLocale } from "@/lib/utils/form-locale-server";
import {
  createValidationErrorResponse,
  createGenericErrorResponse,
  logActionError,
  type ActionResponse,
} from "@/lib/utils/form-responses";
import {
  createErrorResponseI18n,
  createSuccessResponseI18n,
  createFieldErrorResponseI18n,
} from "@/lib/utils/form-responses-i18n";

// Account deletion schema
const deleteAccountSchema = z
  .object({
    email: emailSchema,
    confirmEmail: emailSchema,
  })
  .refine((data) => data.email === data.confirmEmail, emailMatchRefinement);

// Add password schema (for Google users)
const addPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(
    (data) => data.password === data.confirmPassword,
    passwordMatchRefinement,
  );

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

/**
 * Resolve the authenticated user's id from the session.
 * Server actions MUST derive identity here — never trust a client-supplied id
 * (doing so is an IDOR: any signed-in user could act on another user's data).
 */
async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function registerUser(formData: FormData): Promise<ActionResult> {
  const locale = (formData.get("locale") as string) || "en";

  // Anti-abuse: throttle registrations per IP + email. IP is derived
  // server-side (never the client-supplied FormData value, which is spoofable).
  const registerEmail = ((formData.get("email") as string) || "").toLowerCase();
  if (
    recordAttempt(
      "register",
      [getClientIP(await headers()), registerEmail],
      RATE_LIMITS.register,
    ).blocked
  ) {
    return {
      success: false,
      message: "Too many sign-up attempts. Please try again later.",
    };
  }

  // Use command pattern for registration
  const result = await commandBus.execute(
    RegisterUserCommand,
    {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
      locale,
    },
    {
      locale,
      ipAddress: formData.get("ipAddress") as string | undefined,
      userAgent: formData.get("userAgent") as string | undefined,
    },
  );

  return result;
}

export async function deleteUserAccount(
  formData: FormData,
  _userEmail?: string, // ignored: the target is always the authenticated user
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const session = await auth();
    const sessionUser = session?.user;
    if (!sessionUser?.id || !sessionUser.email) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in to delete your account.",
      );
    }

    // Confirm against the SESSION email — never a client-supplied one. The user
    // must retype their own email; the account deleted is always the session's.
    deleteAccountSchema.parse({
      email: sessionUser.email,
      confirmEmail: formData.get("confirmEmail") as string,
    });

    // Delete the authenticated user by id
    const userRepo = repositories.getUserRepository();
    await userRepo.delete(sessionUser.id);

    console.log("User account deleted:", { userId: sessionUser.id });

    return await createSuccessResponseI18n(
      "success.accountDeleted",
      locale,
      "Account deleted successfully",
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError("deleteUserAccount", error);
    return await createErrorResponseI18n(
      "errors.failedToDeleteAccount",
      locale,
      "Failed to delete account. Please try again.",
    );
  }
}

export async function updateUserProfile(
  formData: FormData,
  _userId?: string, // ignored: identity derived from the session
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const authedUserId = await getSessionUserId();
    if (!authedUserId) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in.",
      );
    }

    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return await createFieldErrorResponseI18n(
        "errors.nameMinLength",
        "name",
        locale,
        "Name must be at least 2 characters long",
      );
    }

    // Update user profile
    const userRepo = repositories.getUserRepository();
    await userRepo.update(authedUserId, { name: name.trim() });

    console.log("User profile updated:", { userId: authedUserId });

    return await createSuccessResponseI18n(
      "success.profileUpdated",
      locale,
      "Profile updated successfully",
    );
  } catch (error) {
    logActionError("updateUserProfile", error);

    return await createErrorResponseI18n(
      "errors.failedToUpdateProfile",
      locale,
      "Failed to update profile. Please try again.",
    );
  }
}

// Add password for Google users
export async function addPasswordToGoogleUser(
  formData: FormData,
  _userId?: string, // ignored: identity derived from the session
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const authedUserId = await getSessionUserId();
    if (!authedUserId) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        locale,
        "You must be signed in.",
      );
    }

    const data = {
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    // Validate input
    const validatedData = addPasswordSchema.parse(data);

    // Check if user exists and is a Google user
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(authedUserId);
    const userWithAccounts = user
      ? await userRepo.findByEmailWithAccounts(user.email)
      : null;

    if (!userWithAccounts) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    // Check if user already has a password
    if (userWithAccounts.password) {
      return await createErrorResponseI18n(
        "errors.userAlreadyHasPassword",
        locale,
        "User already has a password. Use change password instead.",
      );
    }

    // Check if user has Google account
    const hasGoogleAccount =
      userWithAccounts.accounts?.some(
        (account) => account.provider === "google",
      ) || false;
    if (!hasGoogleAccount) {
      return await createErrorResponseI18n(
        "errors.onlyGoogleUsers",
        locale,
        "Only Google authenticated users can add passwords",
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Update user with password and metadata
    await userRepo.updatePassword(authedUserId, hashedPassword);
    await userRepo.update(authedUserId, {
      passwordSetAt: new Date(),
      lastPasswordChange: new Date(),
      hasEmailAccount: true,
      hasGoogleAccount: true, // Ensure Google account flag is set
    });

    console.log("Password added for Google user:", { userId: authedUserId });

    return await createSuccessResponseI18n(
      "success.passwordAdded",
      locale,
      "Password added successfully! You can now sign in with email and password.",
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError("addPasswordToGoogleUser", error);
    return await createErrorResponseI18n(
      "errors.failedToAddPassword",
      locale,
      "Failed to add password. Please try again.",
    );
  }
}

// Change existing password
export async function changeUserPassword(
  formData: FormData,
  _userId?: string, // ignored: identity derived from the session
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  const authedUserId = await getSessionUserId();
  if (!authedUserId) {
    return await createErrorResponseI18n(
      "errors.unauthorized",
      locale,
      "You must be signed in.",
    );
  }

  // Throttle current-password verification attempts per account + IP so a
  // leaked session cannot be used to brute-force the current password.
  if (
    recordAttempt(
      "password-change",
      [authedUserId, getClientIP(await headers())],
      RATE_LIMITS.passwordVerify,
    ).blocked
  ) {
    return {
      success: false,
      message: "Too many attempts. Please try again in a few minutes.",
    };
  }

  // Use command pattern for password change
  const result = await commandBus.execute(
    ChangePasswordCommand,
    {
      userId: authedUserId,
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
      confirmPassword: formData.get("confirmPassword") as string,
      locale,
    },
    {
      userId: authedUserId,
      locale,
      ipAddress: formData.get("ipAddress") as string | undefined,
      userAgent: formData.get("userAgent") as string | undefined,
    },
  );

  return result;
}

// Migrate user account metadata (run once for existing users)
export async function migrateUserAccountMetadata(
  _userId?: string, // ignored: identity derived from the session
): Promise<ActionResult> {
  try {
    const authedUserId = await getSessionUserId();
    if (!authedUserId) {
      return await createErrorResponseI18n(
        "errors.unauthorized",
        "en",
        "You must be signed in.",
      );
    }
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(authedUserId);
    const userWithAccounts = user
      ? await userRepo.findByEmailWithAccounts(user.email)
      : null;

    if (!userWithAccounts) {
      return createGenericErrorResponse("notFound", "User not found");
    }

    const hasGoogleAccount =
      userWithAccounts.accounts?.some(
        (account) => account.provider === "google",
      ) || false;
    const hasPassword = !!userWithAccounts.password;
    const hasEmailAccount = hasPassword;

    // Update user with metadata
    await userRepo.update(authedUserId, {
      hasGoogleAccount,
      hasEmailAccount,
      passwordSetAt:
        userWithAccounts.password && !userWithAccounts.passwordSetAt
          ? userWithAccounts.createdAt
          : userWithAccounts.passwordSetAt,
      lastPasswordChange:
        userWithAccounts.password && !userWithAccounts.lastPasswordChange
          ? userWithAccounts.createdAt
          : userWithAccounts.lastPasswordChange,
      lastLoginAt: userWithAccounts.lastLoginAt || new Date(),
    });

    console.log("User metadata migrated:", {
      userId: authedUserId,
      hasGoogleAccount,
      hasEmailAccount,
    });

    return await createSuccessResponseI18n(
      "success.accountMetadataUpdated",
      "en",
      "Account metadata updated successfully",
    );
  } catch (error) {
    logActionError("migrateUserAccountMetadata", error);
    return await createErrorResponseI18n(
      "errors.failedToMigrateAccountMetadata",
      "en",
      "Failed to migrate account metadata",
    );
  }
}

// Get user account information
export async function getUserAccountInfo(_userId?: string) {
  try {
    const authedUserId = await getSessionUserId();
    if (!authedUserId) {
      return null;
    }
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(authedUserId);

    if (!user) {
      return null;
    }

    const userWithAccounts = await userRepo.findByEmailWithAccounts(user.email);

    if (!userWithAccounts) {
      return null;
    }

    const hasGoogleAccount =
      userWithAccounts.accounts?.some(
        (account) => account.provider === "google",
      ) || false;
    const hasPassword = !!userWithAccounts.password;

    // Auto-migrate if metadata is missing
    if (
      userWithAccounts.hasGoogleAccount === null ||
      userWithAccounts.hasEmailAccount === null
    ) {
      await migrateUserAccountMetadata(authedUserId);

      // Re-fetch updated user data
      const updatedUser = await userRepo.findById(authedUserId);
      const updatedUserWithAccounts = updatedUser
        ? await userRepo.findByEmailWithAccounts(updatedUser.email)
        : null;

      if (updatedUserWithAccounts) {
        return {
          id: updatedUserWithAccounts.id,
          email: updatedUserWithAccounts.email,
          name: updatedUserWithAccounts.name,
          hasGoogleAccount: updatedUserWithAccounts.hasGoogleAccount,
          hasPassword: !!updatedUserWithAccounts.password,
          hasEmailAccount: updatedUserWithAccounts.hasEmailAccount,
          lastLoginMethod: updatedUserWithAccounts.lastLoginMethod,
          passwordSetAt: updatedUserWithAccounts.passwordSetAt,
          lastPasswordChange: updatedUserWithAccounts.lastPasswordChange,
          lastLoginAt: updatedUserWithAccounts.lastLoginAt,
          accounts: updatedUserWithAccounts.accounts || [],
          createdAt: updatedUserWithAccounts.createdAt,
        };
      }
    }

    return {
      id: userWithAccounts.id,
      email: userWithAccounts.email,
      name: userWithAccounts.name,
      hasGoogleAccount:
        userWithAccounts.hasGoogleAccount !== null
          ? userWithAccounts.hasGoogleAccount
          : hasGoogleAccount,
      hasPassword,
      hasEmailAccount:
        userWithAccounts.hasEmailAccount !== null
          ? userWithAccounts.hasEmailAccount
          : hasPassword,
      lastLoginMethod: userWithAccounts.lastLoginMethod,
      passwordSetAt: userWithAccounts.passwordSetAt,
      lastPasswordChange: userWithAccounts.lastPasswordChange,
      lastLoginAt: userWithAccounts.lastLoginAt,
      accounts: userWithAccounts.accounts || [],
      createdAt: userWithAccounts.createdAt,
    };
  } catch (error) {
    console.error("Get user account info error:", error);
    return null;
  }
}
