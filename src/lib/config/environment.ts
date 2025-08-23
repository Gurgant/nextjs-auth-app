/**
 * Environment configuration and validation
 * Ensures all required environment variables are present and valid
 */

import { logger } from "@/lib/monitoring/logger";

interface EnvironmentConfig {
  // Core application
  NODE_ENV: "development" | "production" | "test";
  PORT: number;

  // Database
  DATABASE_URL: string;

  // NextAuth
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;

  // OAuth providers
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Security
  ENCRYPTION_KEY: string;

  // Email configuration
  EMAIL_SERVER_HOST: string;
  EMAIL_SERVER_PORT: number;
  EMAIL_SERVER_USER: string;
  EMAIL_SERVER_PASSWORD: string;
  EMAIL_FROM: string;

  // Optional services
  REDIS_URL?: string;
  SENTRY_DSN?: string;
  ANALYTICS_ID?: string;

  // Logging
  LOG_LEVEL: "debug" | "info" | "warn" | "error" | "fatal";

  // Feature flags
  ENABLE_2FA: boolean;
  ENABLE_EMAIL_VERIFICATION: boolean;
  ENABLE_ACCOUNT_LINKING: boolean;
}

class EnvironmentValidator {
  private config: Partial<EnvironmentConfig> = {};
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor() {
    this.validateEnvironment();
  }

  private validateEnvironment(): void {
    // Core application
    this.config.NODE_ENV = this.validateEnum(
      "NODE_ENV",
      ["development", "production", "test"],
      "development",
    ) as EnvironmentConfig["NODE_ENV"];

    this.config.PORT = this.validateNumber("PORT", 3000);

    // Database
    this.config.DATABASE_URL = this.validateRequired("DATABASE_URL");
    if (this.config.DATABASE_URL) {
      this.validateDatabaseUrl(this.config.DATABASE_URL);
    }

    // NextAuth
    this.config.NEXTAUTH_URL = this.validateRequired("NEXTAUTH_URL");
    this.config.NEXTAUTH_SECRET = this.validateRequired("NEXTAUTH_SECRET");

    if (this.config.NEXTAUTH_URL) {
      this.validateUrl("NEXTAUTH_URL", this.config.NEXTAUTH_URL);
    }

    if (
      this.config.NEXTAUTH_SECRET &&
      this.config.NEXTAUTH_SECRET.length < 32
    ) {
      this.addWarning(
        "NEXTAUTH_SECRET should be at least 32 characters for security",
      );
    }

    // OAuth providers
    this.config.GOOGLE_CLIENT_ID = this.validateRequired("GOOGLE_CLIENT_ID");
    this.config.GOOGLE_CLIENT_SECRET = this.validateRequired(
      "GOOGLE_CLIENT_SECRET",
    );

    // Security
    this.config.ENCRYPTION_KEY = this.validateRequired("ENCRYPTION_KEY");
    if (
      this.config.ENCRYPTION_KEY &&
      this.config.ENCRYPTION_KEY.length !== 64
    ) {
      this.addError(
        "ENCRYPTION_KEY must be exactly 64 characters (32 bytes in hex)",
      );
    }

    // Email configuration
    this.config.EMAIL_SERVER_HOST = this.validateRequired("EMAIL_SERVER_HOST");
    this.config.EMAIL_SERVER_PORT = this.validateNumber(
      "EMAIL_SERVER_PORT",
      587,
    );
    this.config.EMAIL_SERVER_USER = this.validateRequired("EMAIL_SERVER_USER");
    this.config.EMAIL_SERVER_PASSWORD = this.validateRequired(
      "EMAIL_SERVER_PASSWORD",
    );
    this.config.EMAIL_FROM = this.validateRequired("EMAIL_FROM");

    if (this.config.EMAIL_FROM && !this.isValidEmail(this.config.EMAIL_FROM)) {
      this.addError("EMAIL_FROM must be a valid email address");
    }

    // Optional services
    this.config.REDIS_URL = this.validateOptional("REDIS_URL");
    this.config.SENTRY_DSN = this.validateOptional("SENTRY_DSN");
    this.config.ANALYTICS_ID = this.validateOptional("ANALYTICS_ID");

    // Logging
    this.config.LOG_LEVEL = this.validateEnum(
      "LOG_LEVEL",
      ["debug", "info", "warn", "error", "fatal"],
      "info",
    ) as EnvironmentConfig["LOG_LEVEL"];

    // Feature flags
    this.config.ENABLE_2FA = this.validateBoolean("ENABLE_2FA", true);
    this.config.ENABLE_EMAIL_VERIFICATION = this.validateBoolean(
      "ENABLE_EMAIL_VERIFICATION",
      true,
    );
    this.config.ENABLE_ACCOUNT_LINKING = this.validateBoolean(
      "ENABLE_ACCOUNT_LINKING",
      true,
    );

    // Production-specific validations
    if (this.config.NODE_ENV === "production") {
      this.validateProductionRequirements();
    }

    // Log results
    if (this.errors.length > 0) {
      logger.fatal("Environment validation failed", undefined, {
        component: "environment",
        metadata: { errors: this.errors },
      });
      throw new Error(
        `Environment validation failed:\n${this.errors.join("\n")}`,
      );
    }

    if (this.warnings.length > 0) {
      logger.warn("Environment validation warnings", {
        component: "environment",
        metadata: { warnings: this.warnings },
      });
    }

    logger.info("Environment validation completed successfully", {
      component: "environment",
      metadata: {
        environment: this.config.NODE_ENV,
        warnings: this.warnings.length,
      },
    });
  }

  private validateRequired(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      this.addError(`${key} is required but not set`);
      return "";
    }
    return value.trim();
  }

  private validateOptional(key: string): string | undefined {
    const value = process.env[key];
    return value && value.trim() !== "" ? value.trim() : undefined;
  }

  private validateNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      this.addError(`${key} must be a valid number`);
      return defaultValue;
    }
    return parsed;
  }

  private validateBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;

    const lower = value.toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "no", "off"].includes(lower)) return false;

    this.addWarning(
      `${key} should be a boolean value (true/false), using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  private validateEnum<T extends string>(
    key: string,
    allowedValues: T[],
    defaultValue: T,
  ): T {
    const value = process.env[key] as T;
    if (!value) return defaultValue;

    if (!allowedValues.includes(value)) {
      this.addError(`${key} must be one of: ${allowedValues.join(", ")}`);
      return defaultValue;
    }
    return value;
  }

  private validateUrl(key: string, url: string): void {
    try {
      new URL(url);
    } catch {
      this.addError(`${key} must be a valid URL`);
    }
  }

  private validateDatabaseUrl(url: string): void {
    if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
      this.addError("DATABASE_URL must be a PostgreSQL connection string");
    }

    // Check for SSL in production
    if (this.config.NODE_ENV === "production" && !url.includes("sslmode=")) {
      this.addWarning(
        "DATABASE_URL should include SSL configuration for production (sslmode=require)",
      );
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validateProductionRequirements(): void {
    // Check HTTPS in production
    if (
      this.config.NEXTAUTH_URL &&
      !this.config.NEXTAUTH_URL.startsWith("https://")
    ) {
      this.addError("NEXTAUTH_URL must use HTTPS in production");
    }

    // Warn about missing optional but recommended services
    if (!this.config.REDIS_URL) {
      this.addWarning(
        "REDIS_URL not set - consider using Redis for session storage in production",
      );
    }

    if (!this.config.SENTRY_DSN) {
      this.addWarning(
        "SENTRY_DSN not set - consider using error tracking in production",
      );
    }

    // Check security requirements
    if (this.config.LOG_LEVEL === "debug") {
      this.addWarning(
        "LOG_LEVEL=debug in production may expose sensitive information",
      );
    }
  }

  private addError(message: string): void {
    this.errors.push(message);
  }

  private addWarning(message: string): void {
    this.warnings.push(message);
  }

  getConfig(): EnvironmentConfig {
    return this.config as EnvironmentConfig;
  }

  getValidationSummary(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }
}

// Create and export validated configuration
const validator = new EnvironmentValidator();
export const env = validator.getConfig();
export const envValidation = validator.getValidationSummary();

// Export validation function for use in health checks
export function validateEnvironment(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: EnvironmentConfig;
} {
  return {
    ...envValidation,
    config: env,
  };
}
