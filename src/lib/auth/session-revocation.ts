import { randomUUID } from "crypto";
import type { JWT, JWTOptions } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { resolveSessionMaxAge } from "@/lib/session-config";

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
 * propagate (fail closed): an unreadable revocation list revokes nothing.
 */
export async function verifySessionToken(token: JWT): Promise<JWT | null> {
  // No sid: the token was issued before sessions could be revoked.
  if (typeof token.id !== "string" || typeof token.sid !== "string") {
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
  // Signed out, account deleted, or password changed since the sign-in. A
  // token without sv was issued while every user was at version 0.
  if (revoked || !user || user.sessionVersion !== (token.sv ?? 0)) return null;
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
  // The presented token's exp is not the latest one possible: a concurrent
  // session request can mint a token that expires at its encode time + maxAge.
  const tokenExpMs = typeof token.exp === "number" ? token.exp * 1000 : 0;
  const expires = new Date(
    Math.max(tokenExpMs, now.getTime() + resolveSessionMaxAge() * 1000) +
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
