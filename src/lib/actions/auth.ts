"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

// Registration schema validation
const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters long"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Account deletion schema
const deleteAccountSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    confirmEmail: z.string().email("Invalid email address"),
  })
  .refine((data) => data.email === data.confirmEmail, {
    message: "Email confirmation doesn't match",
    path: ["confirmEmail"],
  });

// Add password schema (for Google users)
const addPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Change password schema
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  });

export interface ActionResult {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
}

export async function registerUser(formData: FormData): Promise<ActionResult> {
  try {
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
      return {
        success: false,
        message: "An account with this email already exists",
        errors: { email: "An account with this email already exists" },
      };
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

    return {
      success: true,
      message: "Account created successfully!",
    };
  } catch (error) {
    console.error("Registration error:", error);

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err: any) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      return {
        success: false,
        message: "Please check the form for errors",
        errors,
      };
    }

    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}

export async function deleteUserAccount(
  formData: FormData,
  userEmail: string
): Promise<ActionResult> {
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
      return {
        success: false,
        message: "User not found",
      };
    }

    // Delete user account
    await prisma.user.delete({
      where: { email: validatedData.email },
    });

    console.log("User account deleted:", { email: validatedData.email });

    return {
      success: true,
      message: "Account deleted successfully",
    };
  } catch (error) {
    console.error("Account deletion error:", error);

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err: any) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      return {
        success: false,
        message: "Please check the form for errors",
        errors,
      };
    }

    return {
      success: false,
      message: "Failed to delete account. Please try again.",
    };
  }
}

export async function updateUserProfile(
  formData: FormData,
  userId: string
): Promise<ActionResult> {
  try {
    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return {
        success: false,
        message: "Name must be at least 2 characters long",
        errors: { name: "Name must be at least 2 characters long" },
      };
    }

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });

    console.log("User profile updated:", { userId, name });

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error) {
    console.error("Profile update error:", error);

    return {
      success: false,
      message: "Failed to update profile. Please try again.",
    };
  }
}

// Add password for Google users
export async function addPasswordToGoogleUser(
  formData: FormData,
  userId: string
): Promise<ActionResult> {
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
      return {
        success: false,
        message: "User not found",
      };
    }

    // Check if user already has a password
    if (user.password) {
      return {
        success: false,
        message: "User already has a password. Use change password instead.",
      };
    }

    // Check if user has Google account
    const hasGoogleAccount = user.accounts.some(
      (account) => account.provider === "google"
    );
    if (!hasGoogleAccount) {
      return {
        success: false,
        message: "Only Google authenticated users can add passwords",
      };
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

    return {
      success: true,
      message:
        "Password added successfully! You can now sign in with email and password.",
    };
  } catch (error) {
    console.error("Add password error:", error);

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err: any) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      return {
        success: false,
        message: "Please check the form for errors",
        errors,
      };
    }

    return {
      success: false,
      message: "Failed to add password. Please try again.",
    };
  }
}

// Change existing password
export async function changeUserPassword(
  formData: FormData,
  userId: string
): Promise<ActionResult> {
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
      return {
        success: false,
        message: "User not found",
      };
    }

    if (!user.password) {
      return {
        success: false,
        message: "User does not have a password set",
      };
    }

    // Verify current password
    const currentPasswordMatch = await bcrypt.compare(
      validatedData.currentPassword,
      user.password
    );
    if (!currentPasswordMatch) {
      return {
        success: false,
        message: "Current password is incorrect",
        errors: { currentPassword: "Current password is incorrect" },
      };
    }

    // Check if new password is different from current
    const samePassword = await bcrypt.compare(
      validatedData.newPassword,
      user.password
    );
    if (samePassword) {
      return {
        success: false,
        message: "New password must be different from current password",
        errors: {
          newPassword: "New password must be different from current password",
        },
      };
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

    return {
      success: true,
      message: "Password changed successfully!",
    };
  } catch (error) {
    console.error("Change password error:", error);

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err: any) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      return {
        success: false,
        message: "Please check the form for errors",
        errors,
      };
    }

    return {
      success: false,
      message: "Failed to change password. Please try again.",
    };
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
      return { success: false, message: "User not found" };
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

    return {
      success: true,
      message: "Account metadata updated successfully",
    };
  } catch (error) {
    console.error("Migration error:", error);
    return {
      success: false,
      message: "Failed to migrate account metadata",
    };
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
