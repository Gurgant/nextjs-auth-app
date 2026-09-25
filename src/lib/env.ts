/**
 * Boot-time environment validation (fail-fast).
 *
 * SERVER-ONLY. This module reads secrets from `process.env`; never import it
 * into a Client Component. It is loaded once at server startup via the
 * `register()` hook in `src/instrumentation.ts`, so a misconfigured environment
 * aborts the process before it serves any request.
 *
 * The schema only validates the variables this app actually consumes at
 * runtime; unknown keys (PATH, test-only vars, …) are ignored. Production-only
 * and cross-field rules are checked imperatively so ALL problems are reported
 * at once and only names + messages are printed — never secret values.
 */

import { z } from "zod";
import { ENCRYPTION_KEY_PATTERN, isPublicPlaceholder } from "@/lib/env-rules";
import {
  MAX_SESSION_MAX_AGE_SECONDS,
  MIN_SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-config";

const ENCRYPTION_KEY_MESSAGE =
  "must be a 64-character hex string (generate one with `openssl rand -hex 32`)";

const isValidUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database — required in every environment (Prisma cannot connect without it).
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a PostgreSQL connection string"),

  // NextAuth session secret. v5 reads AUTH_SECRET, falling back to
  // NEXTAUTH_SECRET — accept either; presence is enforced in production below.
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters")
    .optional(),

  NEXTAUTH_URL: z.string().refine(isValidUrl, "must be a valid URL").optional(),

  // Passphrase for 2FA secret / backup-code encryption (see src/lib/security.ts).
  // Required in EVERY environment — there is no fallback key.
  ENCRYPTION_KEY: z
    .string({ error: ENCRYPTION_KEY_MESSAGE })
    .regex(ENCRYPTION_KEY_PATTERN, ENCRYPTION_KEY_MESSAGE),

  // Google OAuth — both credentials or neither (checked below).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Email (Resend). Optional — development simulates sending when unset.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  // Security tuning (optional; consumers supply sensible defaults).
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().optional(),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().optional(),
  ACCOUNT_LOCKOUT_DURATION: z.coerce.number().int().positive().optional(), // minutes

  // Session idle timeout in SECONDS (Auth.js `session.maxAge` unit; default
  // 7 days). The bounds turn a unit mistake into a boot error: "7" (days) is
  // below the minimum, a millisecond value is above the maximum.
  SESSION_MAX_AGE: z.coerce
    .number()
    .int("must be a whole number of seconds")
    .min(
      MIN_SESSION_MAX_AGE_SECONDS,
      "must be at least 300 seconds (5 minutes)",
    )
    .max(
      MAX_SESSION_MAX_AGE_SECONDS,
      "must be at most 2592000 seconds (30 days)",
    )
    .optional(),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  const problems: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "(root)";
      problems.push(`${key}: ${issue.message}`);
    }
  }

  // Cross-field and production-only rules, read from raw env so they run even
  // when the base parse failed. Never interpolate the value into the message.
  const isProd = process.env.NODE_ENV === "production";
  const hasSigningSecret =
    !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET;

  if (isProd && !hasSigningSecret) {
    problems.push(
      "AUTH_SECRET (or NEXTAUTH_SECRET): required in production (>= 32 characters)",
    );
  }
  // Values published in this repo (.env.example, CI) are fine locally, but
  // anyone can read them: refuse them where real data is protected.
  if (isProd) {
    for (const name of [
      "AUTH_SECRET",
      "NEXTAUTH_SECRET",
      "ENCRYPTION_KEY",
      "RESEND_API_KEY",
    ]) {
      if (isPublicPlaceholder(process.env[name])) {
        problems.push(
          `${name}: still set to the public example value — generate a real one for production`,
        );
      }
    }
  }
  if (
    isProd &&
    process.env.NEXTAUTH_URL &&
    !process.env.NEXTAUTH_URL.startsWith("https://")
  ) {
    problems.push("NEXTAUTH_URL: must use HTTPS in production");
  }

  const hasGoogleId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  if (hasGoogleId !== hasGoogleSecret) {
    problems.push(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: both must be set together (or neither)",
    );
  }

  if (problems.length > 0) {
    const lines = problems.map((p) => `  - ${p}`).join("\n");
    throw new Error(
      `\n❌ Invalid environment configuration:\n${lines}\n\n` +
        `Fix the variables above (see .env.example) and restart the server.\n`,
    );
  }

  // Unreachable once problems is empty (a parse failure always adds a problem),
  // but this narrows `parsed` to the success branch for the type checker.
  if (!parsed.success) throw parsed.error;

  return parsed.data;
}

// Validated once at module load. The `register()` hook imports this module so a
// misconfigured server fails fast at cold start.
export const env: Env = loadEnv();
