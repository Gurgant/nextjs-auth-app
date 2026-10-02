import { repositories } from "@/lib/repositories";

/**
 * A sign-in that Auth.js has accepted, as its `jwt` callback receives it:
 * `user` is the user the sign-in resolved to (a new row, an existing row, or
 * the signed-in user when linking).
 */
export interface CompletedSignIn {
  user: { id?: string; email?: string | null; emailVerified?: Date | null };
  account?: { provider: string } | null;
  /** For Google: the claims of the ID token. */
  profile?: unknown;
}

/**
 * True only when Google's ID token says `email_verified: true` (the boolean)
 * for the address stored on the user. The addresses are compared without
 * regard to case; a claim about another address says nothing about this one.
 */
export function googleSaysEmailVerified({
  user,
  account,
  profile,
}: CompletedSignIn): boolean {
  if (account?.provider !== "google") return false;
  if (typeof profile !== "object" || profile === null) return false;
  if (!("email_verified" in profile) || profile.email_verified !== true) {
    return false;
  }
  if (!("email" in profile) || typeof profile.email !== "string") return false;
  return (
    typeof user.email === "string" &&
    profile.email.toLowerCase() === user.email.toLowerCase()
  );
}

/**
 * The verification date the session token must carry. When Google has just
 * vouched for an address that is not verified yet, the date is stored first,
 * so the database and the token agree. An existing date is kept as it is and
 * the value is never cleared. Server only.
 *
 * The write may not block the sign-in: a failure is logged and ignored.
 */
export async function resolveEmailVerified(
  signIn: CompletedSignIn,
): Promise<Date | null | undefined> {
  const { user } = signIn;
  if (user.emailVerified || !user.id || !googleSaysEmailVerified(signIn)) {
    return user.emailVerified;
  }

  const verifiedAt = new Date();
  try {
    await repositories
      .getUserRepository()
      .update(user.id, { emailVerified: verifiedAt });
    return verifiedAt;
  } catch (error) {
    console.error("Could not store the e-mail verified by Google:", error);
    return user.emailVerified;
  }
}
