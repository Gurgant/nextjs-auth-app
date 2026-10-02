import { randomUUID } from "crypto";
import type { JWT, JWTOptions } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { MAX_SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";

/**
 * What makes a JWT session revocable. Server-only (Prisma): it runs inside
 * `jwt.decode` (wired in src/lib/auth.ts), so every reader of the session
 * cookie goes through it — the session endpoint, auth(), the sign-out action
 * and the OAuth callback's "already signed in" test.
 *
 * Two claims are put into the token once, at sign-in, and carried through
 * every re-issue: `sid` names the session (a sign-out stores it in
 * RevokedSession), `sv` is the user's sessionVersion at that moment (a
 * password change increments it, which ends every session of the user).
 */

// A row must outlive every token of its session: jose accepts exp + 15 s,
// a request that passed the check can still be re-encoded a moment later,
// and instances may disagree on the clock. A design constant, not measured.
export const REVOCATION_GRACE_SECONDS = 300;

export function newSessionId(): string {
  return randomUUID();
}

/** The session version a token issued now must carry. */
export async function readSessionVersion(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) {
    throw new Error("Cannot start a session for a user that does not exist");
  }
  return user.sessionVersion;
}

/**
 * The token if its session is still live, else null. Database errors
 * propagate (fail closed): when the user or the revocation list cannot be
 * read, no token is accepted.
 */
export async function verifySessionToken(token: JWT): Promise<JWT | null> {
  // No sid: the token was issued before sessions could be revoked. sid and sv
  // are set together at sign-in, so a token with one and not the other is not
  // one this application issued.
  if (
    typeof token.id !== "string" ||
    typeof token.sid !== "string" ||
    typeof token.sv !== "number"
  ) {
    return null;
  }
  const [user, revoked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: token.id },
      select: { role: true, sessionVersion: true },
    }),
    prisma.revokedSession.findUnique({
      where: { sid: token.sid },
      select: { sid: true },
    }),
  ]);
  // Signed out, account deleted, or password changed since the sign-in.
  if (revoked || !user || user.sessionVersion !== token.sv) return null;
  // The database is the authority for the role; every other claim stays the
  // sign-in copy.
  token.role = user.role;
  return token;
}

/** Ends the session of this token. Idempotent. */
export async function revokeSession(
  token: JWT | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (!token || typeof token.sid !== "string") return;
  // The row must outlive every token of the session, and the presented one
  // is not the last word: a concurrent session request can mint a token that
  // expires at its encode time + maxAge, and a copy minted before
  // SESSION_MAX_AGE was lowered (or by an instance that still runs with the
  // old value) carries the longer lifetime. So the longest lifetime a token
  // can have is used, not the configured one.
  const tokenExpMs = typeof token.exp === "number" ? token.exp * 1000 : 0;
  const expires = new Date(
    Math.max(tokenExpMs, now.getTime() + MAX_SESSION_MAX_AGE_SECONDS * 1000) +
      REVOCATION_GRACE_SECONDS * 1000,
  );
  await prisma.revokedSession.createMany({
    data: [{ sid: token.sid, expires }],
    skipDuplicates: true,
  });
  // Rows are only created here, so this is the only cleanup the table needs.
  // A failure must not turn a completed sign-out into an error.
  try {
    await prisma.revokedSession.deleteMany({ where: { expires: { lt: now } } });
  } catch (error) {
    console.error("Could not delete expired session revocations:", error);
  }
}

/** jwt.decode for Auth.js: a session that ended decodes to null, like an invalid token. */
export function createVerifiedDecode(
  baseDecode: JWTOptions["decode"],
): JWTOptions["decode"] {
  return async (params) => {
    const token = await baseDecode(params);
    return token ? verifySessionToken(token) : null;
  };
}
