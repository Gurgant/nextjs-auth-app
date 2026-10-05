import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { requestMetadata } from "@/lib/security";
import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  linkAccountRefusal,
  readLinkAccountRequest,
} from "@/lib/auth/link-account-request";

export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated session
    const session = await auth();
    if (!session?.user?.id) {
      return linkAccountRefusal(
        401,
        "authentication_required",
        "Authentication required",
      );
    }

    // Rate-limit password re-verification (brute-force) per account + IP.
    // The security events record the same client IP, and the User-Agent.
    const client = requestMetadata(request.headers);
    const rlKeys = [session.user.id, client.ipAddress];
    const limited = isRateLimited(
      "link-pw",
      rlKeys,
      RATE_LIMITS.passwordVerify,
    );
    if (limited.blocked) {
      return linkAccountRefusal(
        429,
        "too_many_attempts",
        "Too many attempts. Please try again later.",
        { "Retry-After": String(limited.retryAfterSeconds) },
      );
    }

    // Password and provider, checked before the route queries the user (the
    // session check above has read the database): Google is the only provider
    // this route unlinks (the credentials Account row is not one a user can
    // remove). A request refused here is no password attempt: it is not
    // counted toward the throttle.
    const body = await readLinkAccountRequest(request);
    if (!body.ok) {
      return linkAccountRefusal(400, body.code, body.error);
    }
    const { password, provider } = body;

    // Get user with current accounts
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accounts: true },
    });

    if (!user || !user.password) {
      return linkAccountRefusal(
        404,
        user ? "password_not_set" : "user_not_found",
        "User not found or no password set",
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      recordAttempt("link-pw", rlKeys, RATE_LIMITS.passwordVerify);
      // Log security event for failed password verification
      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: "account_unlink_failed",
          details: "Password verification failed during account unlinking",
          success: false,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
        },
      });

      return linkAccountRefusal(401, "invalid_password", "Invalid password");
    }

    // Correct password — reset the throttle counter.
    clearAttempts("link-pw", rlKeys);

    // The accounts to unlink: a user can hold more than one of the provider
    // (SECURITY.md, "Not one transaction").
    const linkedAccounts = user.accounts.filter(
      (acc) => acc.provider === provider,
    );
    const notLinked = () =>
      linkAccountRefusal(
        404,
        "not_linked",
        "Account not linked to this provider",
      );
    if (linkedAccounts.length === 0) {
      return notLinked();
    }

    // The user keeps a sign-in method: the password that was just checked
    // (an account without one was answered above).
    const accountsRemoved = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Every account of the provider goes, with one statement: a row
        // that stayed would still sign in while the flag below says that
        // there is none. A link completed before this statement goes too;
        // one that writes its row after it stays (SECURITY.md, "Not one
        // transaction").
        const { count } = await tx.account.deleteMany({
          where: { userId: user.id, provider },
        });
        // Another request has unlinked them in the meantime: nothing was
        // removed here, so nothing is recorded.
        if (count === 0) return count;

        // Update user flags
        const updateData: Prisma.UserUpdateInput = { hasGoogleAccount: false };
        // "Last used" must not point at a method that is no longer linked.
        if (user.lastLoginMethod === provider) {
          updateData.lastLoginMethod = null;
        }

        await tx.user.update({
          where: { id: user.id },
          data: updateData,
        });

        // Log security event: how many rows the database removed, and the
        // accounts as they were read before (a link completed in between
        // is counted, not listed).
        await tx.securityEvent.create({
          data: {
            userId: user.id,
            eventType: "account_unlinked",
            details: `Successfully unlinked ${provider} account`,
            success: true,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            metadata: {
              provider,
              accountsRemoved: count,
              providerAccountIds: linkedAccounts.map(
                (acc) => acc.providerAccountId,
              ),
              accountIds: linkedAccounts.map((acc) => acc.id),
            },
          },
        });

        return count;
      },
    );
    if (accountsRemoved === 0) {
      return notLinked();
    }

    return NextResponse.json({
      success: true,
      message: "Account unlinked successfully",
      provider,
      unlinkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Account unlinking error:", error);
    return linkAccountRefusal(
      500,
      "internal_error",
      "Failed to unlink account",
    );
  }
}
