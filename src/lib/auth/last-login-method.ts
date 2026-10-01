/**
 * The sign-in method a user used last: shown as a "Last used" badge on the
 * sign-in page (from a cookie, the visitor is not identified yet) and on the
 * account page (from the database).
 *
 * This file is shared by server and browser code: keep it free of imports.
 */

/** The methods that can be recorded: the Auth.js provider ids of this app. */
export const LOGIN_METHODS = ["credentials", "google"] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];

/**
 * Readable by the page (not HttpOnly) on purpose: it only ever holds one of
 * LOGIN_METHODS, never anything about the account.
 */
export const LAST_LOGIN_METHOD_COOKIE = "last-login-method";

/** One year, in seconds. */
export const LAST_LOGIN_METHOD_MAX_AGE = 60 * 60 * 24 * 365;

/** The value if it is a known method, else null. */
export function parseLoginMethod(value: unknown): LoginMethod | null {
  return LOGIN_METHODS.find((method) => method === value) ?? null;
}

/** Reads the method from a `document.cookie` / `Cookie` header string. */
export function readLastLoginMethod(cookieString: string): LoginMethod | null {
  for (const part of cookieString.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === LAST_LOGIN_METHOD_COOKIE) {
      return parseLoginMethod(part.slice(separator + 1).trim());
    }
  }
  return null;
}
