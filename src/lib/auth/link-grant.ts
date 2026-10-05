import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/**
 * The record that the password step of account linking leaves on the user's
 * row (POST /api/auth/link-account/initiate) and that the link gate spends
 * when the provider returns (./link-gate.ts). Server-only (Prisma).
 *
 * A grant is two columns of User: the provider it is for and the moment it
 * ends. There is at most one per user, it allows one link, and it lives in
 * PostgreSQL, so the password step and the provider's callback may run on
 * different instances.
 */

// How long the Google step may take after the password step. A design
// constant: no real consent step was timed. The refusal text names the same
// minutes (Auth.error.linkNotConfirmedDetails in messages/*.json).
export const LINK_GRANT_TTL_SECONDS = 300;

/**
 * Records that the user has just confirmed, with the password, that an
 * account of `provider` may be linked. An earlier grant is replaced. Written
 * through `client`: the password step hands in its transaction, so that the
 * grant and the event that records it are written together or not at all.
 */
export async function issueLinkGrant(
  userId: string,
  provider: string,
  now: Date = new Date(),
  client: Pick<Prisma.TransactionClient, "user"> = prisma,
): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: {
      linkGrantProvider: provider,
      linkGrantExpiresAt: new Date(
        now.getTime() + LINK_GRANT_TTL_SECONDS * 1000,
      ),
    },
  });
}

/**
 * Uses the grant up. True when this call spent a live grant of this user for
 * this provider; false when there was none, when it had ended, or when
 * another call spent it first.
 *
 * ONE conditional UPDATE on columns of User: no read before it, and no
 * relation in its filter. Two callers that arrive together are decided by the
 * row lock of PostgreSQL, as for the lock of an account after too many failed
 * sign-ins (UserRepository.registerFailedLogin).
 */
export async function spendLinkGrant(
  userId: string,
  provider: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      linkGrantProvider: provider,
      linkGrantExpiresAt: { gt: now },
    },
    data: { linkGrantProvider: null, linkGrantExpiresAt: null },
  });
  return count === 1;
}
