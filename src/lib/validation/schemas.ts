import { z } from "zod";

/**
 * Shared validation schemas for consistent validation across the application
 * All messages use i18n keys for internationalization
 */

// Password validation schema - used in registration, add password, and change password
export const passwordSchema = z
  .string()
  .min(8, { message: "validation.password.minLength" })
  .max(128, { message: "validation.password.maxLength" })
  .regex(/[A-Z]/, { message: "validation.password.requireUppercase" })
  .regex(/[a-z]/, { message: "validation.password.requireLowercase" })
  .regex(/[0-9]/, { message: "validation.password.requireNumber" })
  .regex(/[^A-Za-z0-9]/, { message: "validation.password.requireSpecial" });

// Email validation schema - used in login and registration
export const emailSchema = z
  .string()
  .email({ message: "validation.email.invalid" })
  .max(254, { message: "validation.email.tooLong" })
  .transform((email) => email.trim().toLowerCase());

// Name validation schema - used in registration and profile update
export const nameSchema = z
  .string()
  .min(2, { message: "validation.name.minLength" })
  .max(100, { message: "validation.name.maxLength" });

// Login-specific schemas (without password complexity for existing users)
export const loginEmailSchema = z
  .string()
  .email({ message: "validation.email.invalid" })
  .max(254, { message: "validation.email.tooLong" })
  .transform((email) => email.trim().toLowerCase());

export const loginPasswordSchema = z
  .string()
  .min(1, { message: "validation.password.required" })
  .max(128, { message: "validation.password.maxLength" });

// Common refinements
export const passwordMatchRefinement = {
  message: "validation.password.mismatch",
  path: ["confirmPassword"],
};

export const emailMatchRefinement = {
  message: "validation.email.mismatch",
  path: ["confirmEmail"],
};
