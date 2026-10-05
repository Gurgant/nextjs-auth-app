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

    // Password and provider, checked before anything is read from the
    // database: Google is the only provider this route unlinks (the
    // credentials Account row is not one a user can remove). A request
    // refused here is no password attempt: it is not counted toward the
    // throttle.
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

    // Find the account to unlink
    const accountToUnlink = user.accounts.find(
      (acc) => acc.provider === provider,
    );
    if (!accountToUnlink) {
      return linkAccountRefusal(
        404,
        "not_linked",
        "Account not linked to this provider",
      );
    }

    // The user keeps a sign-in method: the password that was just checked
    // (an account without one was answered above).
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete the account
      await tx.account.delete({
        where: { id: accountToUnlink.id },
      });

      // Update user flags
      const updateData: Prisma.UserUpdateInput = { hasGoogleAccount: false };
      // "Last used" must not point at a method that is no longer linked.
      if (user.lastLoginMethod === provider) {
        updateData.lastLoginMethod = null;
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: updateData,
      });

      // Log security event
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
            providerAccountId: accountToUnlink.providerAccountId,
            accountId: accountToUnlink.id,
          },
        },
      });

      return updatedUser;
    });

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
