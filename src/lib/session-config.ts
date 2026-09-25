/**
 * Session lifetime (Auth.js `session.maxAge`) in SECONDS — the unit Auth.js
 * uses for `session.maxAge`, the JWT `exp` claim and the cookie expiry.
 *
 * Pure: imported by src/lib/env.ts (boot validation) and by
 * src/lib/auth-config.ts, which must NOT import env.ts (it throws at load).
 */
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 604800
export const MIN_SESSION_MAX_AGE_SECONDS = 5 * 60; // 300
export const MAX_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 2592000

export function resolveSessionMaxAge(
  raw: string | undefined = process.env.SESSION_MAX_AGE,
): number {
  if (raw === undefined) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  const seconds = Number(raw);
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_SESSION_MAX_AGE_SECONDS ||
    seconds > MAX_SESSION_MAX_AGE_SECONDS
  ) {
    // A booted server never gets here (env.ts rejects the value first);
    // unvalidated contexts (tests, scripts) fall back to the safe default.
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return seconds;
}
