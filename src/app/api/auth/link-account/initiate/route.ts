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
import { issueLinkGrant } from "@/lib/auth/link-grant";
import {
  linkAccountRefusal,
  readLinkAccountRequest,
} from "@/lib/auth/link-account-request";

export async function POST(request: NextRequest) {
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
    // session check above has read the database). A request refused here is
    // no password attempt: it is not counted toward the throttle.
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
          eventType: "account_link_failed",
          details: "Password verification failed during account linking",
          success: false,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
        },
      });

      return linkAccountRefusal(401, "invalid_password", "Invalid password");
    }

    // Correct password — reset the throttle counter.
    clearAttempts("link-pw", rlKeys);

    // Check if account is already linked
    const existingAccount = user.accounts.find(
      (acc) => acc.provider === provider,
    );
    if (existingAccount) {
      return linkAccountRefusal(
        400,
        "already_linked",
        "Account already linked to this provider",
      );
    }

    // Every check has passed: record the grant that lets Auth.js link one
    // account of this provider to this user when the provider returns
    // (src/lib/auth/link-gate.ts spends it), and the event that says so. In
    // one transaction: a grant without its event could be spent with nothing
    // in the audit trail. The two are all this route writes: nothing is
    // linked here and no token is handed out. The account page starts the
    // Google sign-in next.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await issueLinkGrant(user.id, provider, new Date(), tx);

      await tx.securityEvent.create({
        data: {
          userId: user.id,
          eventType: "account_link_initiated",
          details: `Account linking initiated for provider: ${provider}`,
          success: true,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
          metadata: { provider },
        },
      });
    });

    return NextResponse.json({ success: true, provider });
  } catch (error) {
    console.error("Account linking initiation error:", error);
    return linkAccountRefusal(500, "internal_error", "Internal server error");
  }
}
