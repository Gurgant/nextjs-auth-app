"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { repositories } from "@/lib/repositories";
import {
  commandBus,
  RegisterUserCommand,
  ChangePasswordCommand,
} from "@/lib/commands";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import {
  emailSchema,
  passwordSchema,
  passwordMatchRefinement,
  emailMatchRefinement,
} from "@/lib/validation";
import { resolveFormLocale } from "@/lib/utils/form-locale-enhanced";
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

// Registration schema validation
// TODO: Future feature - User registration form validation
// const registerSchema = z
//   .object({
//     name: nameSchema,
//     email: emailSchema,
//     password: passwordSchema,
//     confirmPassword: z.string(),
//   })
//   .refine((data) => data.password === data.confirmPassword, passwordMatchRefinement);

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

// Change password schema
// TODO: Future feature - Change password form validation
// const changePasswordSchema = z
//   .object({
//     currentPassword: z.string().min(1, { message: "validation.password.required" }),
//     newPassword: passwordSchema,
//     confirmPassword: z.string(),
//   })
//   .refine((data) => data.newPassword === data.confirmPassword, passwordMatchRefinement);

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

export async function registerUser(formData: FormData): Promise<ActionResult> {
  const locale = (formData.get("locale") as string) || "en";

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
  userEmail: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const data = {
      email: userEmail,
      confirmEmail: formData.get("confirmEmail") as string,
    };

    // Validate input
    const validatedData = deleteAccountSchema.parse(data);

    // Find and delete user
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findByEmail(validatedData.email);

    if (!user) {
      return createGenericErrorResponse("notFound", "User not found", locale);
    }

    // Delete user account
    await userRepo.delete(user.id);

    console.log("User account deleted:", { email: validatedData.email });

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
  userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
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
    await userRepo.update(userId, { name: name.trim() });

    console.log("User profile updated:", { userId, name });

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
  userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  try {
    const data = {
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    // Validate input
    const validatedData = addPasswordSchema.parse(data);

    // Check if user exists and is a Google user
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(userId);
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
    await userRepo.updatePassword(userId, hashedPassword);
    await userRepo.update(userId, {
      passwordSetAt: new Date(),
      lastPasswordChange: new Date(),
      hasEmailAccount: true,
      hasGoogleAccount: true, // Ensure Google account flag is set
      primaryAuthMethod: userWithAccounts.primaryAuthMethod || "google",
    } as any);

    console.log("Password added for Google user:", { userId });

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
  userId: string,
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);

  // Use command pattern for password change
  const result = await commandBus.execute(
    ChangePasswordCommand,
    {
      userId,
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
      confirmPassword: formData.get("confirmPassword") as string,
      locale,
    },
    {
      userId,
      locale,
      ipAddress: formData.get("ipAddress") as string | undefined,
      userAgent: formData.get("userAgent") as string | undefined,
    },
  );

  return result;
}

// Migrate user account metadata (run once for existing users)
export async function migrateUserAccountMetadata(
  userId: string,
): Promise<ActionResult> {
  try {
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(userId);
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

    // Determine primary auth method
    let primaryAuthMethod = null;
    if (hasGoogleAccount && hasPassword) {
      // If both, keep existing or default to google
      primaryAuthMethod = userWithAccounts?.primaryAuthMethod || "google";
    } else if (hasGoogleAccount) {
      primaryAuthMethod = "google";
    } else if (hasPassword) {
      primaryAuthMethod = "email";
    }

    // Update user with metadata
    await userRepo.update(userId, {
      hasGoogleAccount,
      hasEmailAccount,
      primaryAuthMethod,
      passwordSetAt:
        userWithAccounts.password && !userWithAccounts.passwordSetAt
          ? userWithAccounts.createdAt
          : userWithAccounts.passwordSetAt,
      lastPasswordChange:
        userWithAccounts.password && !userWithAccounts.lastPasswordChange
          ? userWithAccounts.createdAt
          : userWithAccounts.lastPasswordChange,
      lastLoginAt: userWithAccounts.lastLoginAt || new Date(),
    } as any);

    console.log("User metadata migrated:", {
      userId,
      hasGoogleAccount,
      hasEmailAccount,
      primaryAuthMethod,
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
export async function getUserAccountInfo(userId: string) {
  try {
    const userRepo = repositories.getUserRepository();
    const user = await userRepo.findById(userId);

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
      console.log("Auto-migrating user metadata for:", userId);
      await migrateUserAccountMetadata(userId);

      // Re-fetch updated user data
      const updatedUser = await userRepo.findById(userId);
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
          primaryAuthMethod: updatedUserWithAccounts.primaryAuthMethod,
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
      primaryAuthMethod: userWithAccounts.primaryAuthMethod,
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
