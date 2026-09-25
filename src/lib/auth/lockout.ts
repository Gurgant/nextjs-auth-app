import type { LockoutPolicy } from "@/lib/repositories/user/user.repository.interface";

/**
 * Temporary account lockout policy for credential sign-in.
 *
 * MAX_LOGIN_ATTEMPTS: consecutive failed attempts (wrong password or wrong
 * 2FA code) before the account is locked. ACCOUNT_LOCKOUT_DURATION: lock
 * length in MINUTES. Read on every call so tests and restarts pick up changes;
 * invalid values fall back to the defaults (env.ts rejects them at boot).
 */
export const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
export const DEFAULT_LOCKOUT_MINUTES = 15;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function getLockoutPolicy(
  env: NodeJS.ProcessEnv = process.env,
): LockoutPolicy {
  return {
    maxAttempts: positiveInt(
      env.MAX_LOGIN_ATTEMPTS,
      DEFAULT_MAX_LOGIN_ATTEMPTS,
    ),
    lockoutMs:
      positiveInt(env.ACCOUNT_LOCKOUT_DURATION, DEFAULT_LOCKOUT_MINUTES) *
      60_000,
  };
}
