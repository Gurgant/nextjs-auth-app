import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";
import { spendLinkGrant } from "@/lib/auth/link-grant";
import { noteLinkRefusal } from "@/lib/auth/link-refusal";

/**
 * The rule for linking a provider account to a user, and what is stored of
 * the account. Server-only (Prisma).
 *
 * Auth.js writes an Account row through `adapter.linkAccount` and through
 * nothing else (read in @auth/core 0.41.3, lib/actions/callback/
 * handle-login.js). The adapter handed to Auth.js is wrapped here, so that
 * call is where the rule sits:
 *
 *   - The row Auth.js created a moment ago for a first sign-in (no password,
 *     e-mail not verified, no Account row) is linked as before.
 *   - Any other user is linked only after spending the grant that the
 *     password step left on the row (./link-grant.ts), and only when the row
 *     showed no account of that provider yet.
 *
 * Either way the row says whose account it is and nothing more
 * (`identityOf` below): the tokens of the provider, which Auth.js hands over
 * with the account, are not stored.
 *
 * A refusal throws: returning without linking would let Auth.js go on as
 * after a successful link (a new session token, the signIn event). The rule
 * reads no request and no cookie; everything it decides is in the database,
 * and a database error propagates (fail closed).
 *
 * The read, the spend and the link are three statements, not one
 * transaction. A grant is used once whatever overlaps (the spend is one
 * UPDATE). "One account per provider" is looked for in the row as it was
 * read BEFORE the spend: two password steps whose links overlap, each with a
 * grant of its own, can both link (SECURITY.md, "Not one transaction";
 * measured by the integration test).
 */

type LinkRefusalReason = "user_not_found" | "no_grant" | "already_linked";

export class LinkNotConfirmedError extends Error {
  constructor(readonly reason: LinkRefusalReason) {
    super(`Account link refused: ${reason}`);
    this.name = "LinkNotConfirmedError";
  }
}

/**
 * What the application stores of a provider account: the four values that
 * say whose it is. Auth.js hands `linkAccount` more: what the provider's
 * token endpoint answered (for Google an access token, an ID token, their
 * expiry, scope and type and, with offline access, a refresh token). Nothing
 * reads those values back: the application calls no API of the provider, and
 * Auth.js looks an account up by provider and account id to find its user
 * (read in @auth/core 0.41.3 and @auth/prisma-adapter 2.11.3). So they are
 * left out, with anything else a provider adds, and the token columns of the
 * Account table stay NULL. A project that needs the tokens returns the
 * account from here as it comes, and should encrypt them first.
 */
function identityOf(account: AdapterAccount): AdapterAccount {
  const { userId, type, provider, providerAccountId } = account;
  return { userId, type, provider, providerAccountId };
}

/** The adapter with the rule in front of its `linkAccount`; every other method is the adapter's own. */
export function withLinkGate(base: Adapter): Omit<Adapter, "linkAccount"> & {
  linkAccount(account: AdapterAccount): Promise<void>;
} {
  return {
    ...base,
    async linkAccount(account: AdapterAccount): Promise<void> {
      // Looked up at call time: an adapter without the method is refused when
      // Auth.js tries to link, not when the configuration is loaded.
      const link = base.linkAccount;
      if (!link) throw new Error("The adapter cannot link accounts");

      const user = await prisma.user.findUnique({
        where: { id: account.userId },
        select: {
          password: true,
          emailVerified: true,
          accounts: { select: { provider: true } },
        },
      });

      // A first sign-in: Auth.js calls createUser({ ...profile,
      // emailVerified: null }) and links right after it.
      if (
        user !== null &&
        user.password === null &&
        user.emailVerified === null &&
        user.accounts.length === 0
      ) {
        await link(identityOf(account));
        return;
      }

      let reason: LinkRefusalReason | null = null;
      if (user === null) {
        reason = "user_not_found";
      } else if (!(await spendLinkGrant(account.userId, account.provider))) {
        reason = "no_grant";
      } else if (user.accounts.some((a) => a.provider === account.provider)) {
        // One account per provider and user, as the row read above shows
        // it. The grant is used up.
        reason = "already_linked";
      }

      if (reason !== null) {
        noteLinkRefusal();
        if (user !== null) {
          await logSecurityEvent({
            userId: account.userId,
            eventType: "account_link_refused",
            success: false,
            details: `Refused to link a ${account.provider} account: ${reason}`,
            metadata: { provider: account.provider, reason },
          });
        }
        throw new LinkNotConfirmedError(reason);
      }

      await link(identityOf(account));
      // No address and no browser: an adapter is handed no request.
      await logSecurityEvent({
        userId: account.userId,
        eventType: "account_link_completed",
        details: `Linked a ${account.provider} account after the password check`,
        metadata: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },
  };
}
