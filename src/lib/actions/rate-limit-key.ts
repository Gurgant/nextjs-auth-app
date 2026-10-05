// The longest address the registration accepts (emailSchema in
// src/lib/validation/schemas.ts).
const MAX_EMAIL_KEY_LENGTH = 254;

/**
 * The rate-limit key of an e-mail address that a client sent. The actions
 * count an attempt before anything validates the address, and the limiter
 * keeps every key whole, up to 20,000 of them (src/lib/rate-limit.ts): so the
 * key is bounded here. It is the address in lower case, cut to the longest
 * address the registration accepts. A value that is no text (a form field
 * can hold a file, an argument of a server action anything) has no key: the
 * attempt then counts against the client IP alone.
 */
export function emailRateLimitKey(email: unknown): string | undefined {
  // Lower case first: it can be longer than the text it was made from.
  return typeof email === "string"
    ? email.toLowerCase().slice(0, MAX_EMAIL_KEY_LENGTH)
    : undefined;
}
