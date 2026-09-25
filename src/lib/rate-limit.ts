import { LRUCache } from "lru-cache";

/**
 * Best-effort, in-memory (LRU) rate limiter for a single server process.
 *
 * IMPORTANT — honest limitations (documented in SECURITY.md):
 *  - Counters live in this process only; they are NOT shared across multiple
 *    instances (horizontally-scaled / serverless / edge), so effective limits
 *    multiply by the number of instances.
 *  - All counters reset on restart/redeploy.
 *  - One of the keys is the client IP, which is only trustworthy behind a
 *    correctly-configured, trusted `X-Forwarded-For`.
 * For production / multi-instance deployments, back this with a shared store
 * (e.g. Redis/Upstash). A rate limiter is one layer — MFA, account lockout and
 * CAPTCHA remain the primary controls (OWASP, NIST SP 800-63B).
 *
 * Algorithm: fixed window. Each key holds `{ count, windowStart }`; the window
 * resets once `now - windowStart >= windowMs`. Fixed window can allow up to ~2x
 * the limit across a boundary — negligible here because the thresholds are tiny.
 *
 * Keying: pass MULTIPLE keys (e.g. account id AND client IP). A caller is
 * blocked if ANY key is over its limit. Per OWASP the account-scoped counter is
 * the primary defense against distributed brute force; the IP counter stops one
 * host spraying many accounts.
 *
 * Two call patterns, both allowing exactly `rule.limit` attempts per window:
 *  - Count-every-request (email sends, registration): call {@link recordAttempt}
 *    and reject when it returns `blocked` (it counts, then blocks the
 *    `limit + 1`-th call).
 *  - Failure-counted (password / 2FA verification): gate with {@link
 *    isRateLimited} BEFORE verifying (blocked once `limit` failures are on
 *    record), call {@link recordAttempt} only on a failed check, and {@link
 *    clearAttempts} on success.
 */

export interface RateLimitRule {
  /** Max attempts allowed within the window. */
  limit: number;
  /** Rolling window length, in milliseconds. */
  windowMs: number;
}

export interface RateLimitStatus {
  /** True when the caller is over the limit and should be denied. */
  blocked: boolean;
  /** Attempts remaining before blocking (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — for a `Retry-After` header (0 when not blocked). */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const MINUTE = 60_000;

/**
 * Default rules, aligned with OWASP account-lockout norms (3–5/account) and the
 * NIST SP 800-63B ceiling (≤100 failed attempts). Tune to real traffic.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const RATE_LIMITS = {
  /** Failed credential sign-ins, per email AND per client IP (AUTH_RATE_LIMIT). */
  login: { limit: positiveIntEnv("AUTH_RATE_LIMIT", 10), windowMs: 1 * MINUTE },
  /** Failed 2FA (TOTP/backup) code submissions, per account. */
  twoFactor: { limit: 5, windowMs: 15 * MINUTE },
  /** Password re-verification: account link/unlink, change password. */
  passwordVerify: { limit: 5, windowMs: 15 * MINUTE },
  /** Verification-email sends, per email + IP (anti mail-bombing). */
  emailVerify: { limit: 5, windowMs: 15 * MINUTE },
  /** New-account registrations, per IP + email. */
  register: { limit: 5, windowMs: 60 * MINUTE },
  /** Account-link initiations, per account + IP. */
  accountLink: { limit: 5, windowMs: 60 * MINUTE },
} satisfies Record<string, RateLimitRule>;

// One process-wide store; LRU eviction bounds memory at `max` live keys.
const store = new LRUCache<string, Bucket>({ max: 20_000 });

const OK: RateLimitStatus = {
  blocked: false,
  remaining: 0,
  retryAfterSeconds: 0,
};

function normalize(keys: Array<string | null | undefined>): string[] {
  return keys.filter((k): k is string => typeof k === "string" && k.length > 0);
}

/** Return the live bucket for a key, or null if absent/expired. */
function liveBucket(
  key: string,
  rule: RateLimitRule,
  now: number,
): Bucket | null {
  const b = store.get(key);
  return b && now - b.windowStart < rule.windowMs ? b : null;
}

function retryAfter(
  windowStart: number,
  rule: RateLimitRule,
  now: number,
): number {
  return Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
}

/**
 * Peek at the current status WITHOUT counting an attempt — blocked if ANY key
 * already has `limit` attempts on record. Use as the gate before verifying a
 * secret (password / 2FA code) so only genuine failures are counted (via
 * {@link recordAttempt}).
 */
export function isRateLimited(
  scope: string,
  keys: Array<string | null | undefined>,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitStatus {
  let worst: RateLimitStatus = { ...OK, remaining: rule.limit };
  for (const id of normalize(keys)) {
    const bucket = liveBucket(`${scope}:${id}`, rule, now);
    const count = bucket?.count ?? 0;
    if (count >= rule.limit) {
      return {
        blocked: true,
        remaining: 0,
        retryAfterSeconds: retryAfter(bucket?.windowStart ?? now, rule, now),
      };
    }
    const remaining = rule.limit - count;
    if (remaining < worst.remaining) worst = { ...OK, remaining };
  }
  return worst;
}

/**
 * Count one attempt against EVERY key and return the resulting status — blocked
 * when a key exceeds its limit (i.e. this is the `limit + 1`-th attempt). Use
 * for count-every-request surfaces, or to record a failed secret verification.
 */
export function recordAttempt(
  scope: string,
  keys: Array<string | null | undefined>,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitStatus {
  let result: RateLimitStatus = { ...OK, remaining: rule.limit };
  for (const id of normalize(keys)) {
    const key = `${scope}:${id}`;
    const bucket = liveBucket(key, rule, now) ?? { count: 0, windowStart: now };
    bucket.count += 1;
    store.set(key, bucket);
    if (bucket.count > rule.limit) {
      result = {
        blocked: true,
        remaining: 0,
        retryAfterSeconds: retryAfter(bucket.windowStart, rule, now),
      };
    } else if (!result.blocked) {
      const remaining = rule.limit - bucket.count;
      if (remaining < result.remaining) result = { ...OK, remaining };
    }
  }
  return result;
}

/** Clear every counter for these keys — call after a successful verification. */
export function clearAttempts(
  scope: string,
  keys: Array<string | null | undefined>,
): void {
  for (const id of normalize(keys)) store.delete(`${scope}:${id}`);
}

/** Test-only: wipe the whole store so cases don't leak state into each other. */
export function __resetRateLimitStore(): void {
  store.clear();
}
