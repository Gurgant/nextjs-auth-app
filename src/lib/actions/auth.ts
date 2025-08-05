"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { 
  emailSchema, 
  passwordSchema, 
  nameSchema,
  passwordMatchRefinement,
  emailMatchRefinement
} from "@/lib/validation";
import { resolveFormLocale } from "@/lib/utils/form-locale-enhanced";
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  createFieldErrorResponse,
  createGenericErrorResponse,
  logActionError,
  type ActionResponse
} from "@/lib/utils/form-responses";
import {
  createErrorResponseI18n,
  createSuccessResponseI18n,
  createFieldErrorResponseI18n
} from "@/lib/utils/form-responses-i18n";

// Registration schema validation
const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, passwordMatchRefinement);

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
  .refine((data) => data.password === data.confirmPassword, passwordMatchRefinement);

// Change password schema
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "validation.password.required" }),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, passwordMatchRefinement);

// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;

export async function registerUser(formData: FormData): Promise<ActionResult> {
  try {
    const locale = formData.get("locale") as string || "en";
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    // Validate input
    const validatedData = registerSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return await createFieldErrorResponseI18n(
        "errors.accountAlreadyExists",
        "email",
        locale,
        "An account with this email already exists"
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Create user with proper metadata
    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        hasEmailAccount: true,
        hasGoogleAccount: false,
        primaryAuthMethod: "email",
        passwordSetAt: new Date(),
        lastPasswordChange: new Date(),
      },
    });

    console.log("User created successfully:", {
      id: user.id,
      email: user.email,
    });

    return await createSuccessResponseI18n(
      "success.accountCreated",
      locale,
      "Account created successfully!"
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const locale = await resolveFormLocale(formData);
      return createValidationErrorResponse(error, locale);
    }

    const locale = await resolveFormLocale(formData);
    logActionError('registerUser', error);
    return createGenericErrorResponse('unknown', undefined, locale);
  }
}

export async function deleteUserAccount(
  formData: FormData,
  userEmail: string
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
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (!user) {
      return createGenericErrorResponse('notFound', 'User not found', locale);
    }

    // Delete user account
    await prisma.user.delete({
      where: { email: validatedData.email },
    });

    console.log("User account deleted:", { email: validatedData.email });

    return await createSuccessResponseI18n(
      "success.accountDeleted",
      locale,
      "Account deleted successfully"
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError('deleteUserAccount', error);
    return await createErrorResponseI18n(
      "errors.failedToDeleteAccount",
      locale,
      "Failed to delete account. Please try again."
    );
  }
}

export async function updateUserProfile(
  formData: FormData,
  userId: string
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);
  
  try {
    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return await createFieldErrorResponseI18n(
        "errors.nameMinLength",
        "name",
        locale,
        "Name must be at least 2 characters long"
      );
    }

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });

    console.log("User profile updated:", { userId, name });

    return await createSuccessResponseI18n(
      "success.profileUpdated",
      locale,
      "Profile updated successfully"
    );
  } catch (error) {
    logActionError('updateUserProfile', error);
    
    return await createErrorResponseI18n(
      "errors.failedToUpdateProfile",
      locale,
      "Failed to update profile. Please try again."
    );
  }
}

// Add password for Google users
export async function addPasswordToGoogleUser(
  formData: FormData,
  userId: string
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    });

    if (!user) {
      return createGenericErrorResponse('notFound', 'User not found', locale);
    }

    // Check if user already has a password
    if (user.password) {
      return await createErrorResponseI18n(
        "errors.userAlreadyHasPassword",
        locale,
        "User already has a password. Use change password instead."
      );
    }

    // Check if user has Google account
    const hasGoogleAccount = user.accounts.some(
      (account) => account.provider === "google"
    );
    if (!hasGoogleAccount) {
      return await createErrorResponseI18n(
        "errors.onlyGoogleUsers",
        locale,
        "Only Google authenticated users can add passwords"
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Update user with password and metadata
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordSetAt: new Date(),
        lastPasswordChange: new Date(),
        hasEmailAccount: true,
        hasGoogleAccount: true, // Ensure Google account flag is set
        primaryAuthMethod: user.primaryAuthMethod || "google",
      },
    });

    console.log("Password added for Google user:", { userId });

    return await createSuccessResponseI18n(
      "success.passwordAdded",
      locale,
      "Password added successfully! You can now sign in with email and password."
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError('addPasswordToGoogleUser', error);
    return await createErrorResponseI18n(
      "errors.failedToAddPassword",
      locale,
      "Failed to add password. Please try again."
    );
  }
}

// Change existing password
export async function changeUserPassword(
  formData: FormData,
  userId: string
): Promise<ActionResult> {
  const locale = await resolveFormLocale(formData);
  
  try {
    const data = {
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    // Validate input
    const validatedData = changePasswordSchema.parse(data);

    // Check if user exists and has a password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return createGenericErrorResponse('notFound', 'User not found', locale);
    }

    if (!user.password) {
      return await createErrorResponseI18n(
        "errors.userDoesNotHavePassword",
        locale,
        "User does not have a password set"
      );
    }

    // Verify current password
    const currentPasswordMatch = await bcrypt.compare(
      validatedData.currentPassword,
      user.password
    );
    if (!currentPasswordMatch) {
      return await createFieldErrorResponseI18n(
        "errors.currentPasswordIncorrect",
        "currentPassword",
        locale,
        "Current password is incorrect"
      );
    }

    // Check if new password is different from current
    const samePassword = await bcrypt.compare(
      validatedData.newPassword,
      user.password
    );
    if (samePassword) {
      return await createFieldErrorResponseI18n(
        "errors.passwordMustBeDifferent",
        "newPassword",
        locale,
        "New password must be different from current password"
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(validatedData.newPassword, 12);

    // Update user with new password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        lastPasswordChange: new Date(),
        requiresPasswordChange: false,
      },
    });

    console.log("Password changed for user:", { userId });

    return await createSuccessResponseI18n(
      "success.passwordChanged",
      locale,
      "Password changed successfully!"
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError('changeUserPassword', error);
    return await createErrorResponseI18n(
      "errors.failedToChangePassword",
      locale,
      "Failed to change password. Please try again."
    );
  }
}

// Migrate user account metadata (run once for existing users)
export async function migrateUserAccountMetadata(
  userId: string
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
      return createGenericErrorResponse('notFound', 'User not found');
    }

    const hasGoogleAccount = user.accounts.some(
      (account) => account.provider === "google"
    );
    const hasPassword = !!user.password;
    const hasEmailAccount = hasPassword;

    // Determine primary auth method
    let primaryAuthMethod = null;
    if (hasGoogleAccount && hasPassword) {
      // If both, keep existing or default to google
      primaryAuthMethod = user.primaryAuthMethod || "google";
    } else if (hasGoogleAccount) {
      primaryAuthMethod = "google";
    } else if (hasPassword) {
      primaryAuthMethod = "email";
    }

    // Update user with metadata
    await prisma.user.update({
      where: { id: userId },
      data: {
        hasGoogleAccount,
        hasEmailAccount,
        primaryAuthMethod,
        passwordSetAt:
          user.password && !user.passwordSetAt
            ? user.createdAt
            : user.passwordSetAt,
        lastPasswordChange:
          user.password && !user.lastPasswordChange
            ? user.createdAt
            : user.lastPasswordChange,
        lastLoginAt: user.lastLoginAt || new Date(),
      },
    });

    console.log("User metadata migrated:", {
      userId,
      hasGoogleAccount,
      hasEmailAccount,
      primaryAuthMethod,
    });

    return await createSuccessResponseI18n(
      "success.accountMetadataUpdated",
      'en',
      "Account metadata updated successfully"
    );
  } catch (error) {
    logActionError('migrateUserAccountMetadata', error);
    return await createErrorResponseI18n(
      "errors.failedToMigrateAccountMetadata",
      'en',
      "Failed to migrate account metadata"
    );
  }
}

// Get user account information
export async function getUserAccountInfo(userId: string) {
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
      return null;
    }

    const hasGoogleAccount = user.accounts.some(
      (account) => account.provider === "google"
    );
    const hasPassword = !!user.password;

    // Auto-migrate if metadata is missing
    if (user.hasGoogleAccount === null || user.hasEmailAccount === null) {
      console.log("Auto-migrating user metadata for:", userId);
      await migrateUserAccountMetadata(userId);

      // Re-fetch updated user data
      const updatedUser = await prisma.user.findUnique({
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

      if (updatedUser) {
        return {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          hasGoogleAccount: updatedUser.hasGoogleAccount,
          hasPassword: !!updatedUser.password,
          hasEmailAccount: updatedUser.hasEmailAccount,
          primaryAuthMethod: updatedUser.primaryAuthMethod,
          passwordSetAt: updatedUser.passwordSetAt,
          lastPasswordChange: updatedUser.lastPasswordChange,
          lastLoginAt: updatedUser.lastLoginAt,
          accounts: updatedUser.accounts || [],
          createdAt: updatedUser.createdAt,
        };
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      hasGoogleAccount:
        user.hasGoogleAccount !== null
          ? user.hasGoogleAccount
          : hasGoogleAccount,
      hasPassword,
      hasEmailAccount:
        user.hasEmailAccount !== null ? user.hasEmailAccount : hasPassword,
      primaryAuthMethod: user.primaryAuthMethod,
      passwordSetAt: user.passwordSetAt,
      lastPasswordChange: user.lastPasswordChange,
      lastLoginAt: user.lastLoginAt,
      accounts: user.accounts || [],
      createdAt: user.createdAt,
    };
  } catch (error) {
    console.error("Get user account info error:", error);
    return null;
  }
}
