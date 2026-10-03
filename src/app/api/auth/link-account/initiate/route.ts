import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getClientIP } from "@/lib/security";
import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Get authenticated session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Rate-limit password re-verification (brute-force) per account + IP.
    const rlKeys = [session.user.id, getClientIP(request.headers)];
    const limited = isRateLimited(
      "link-pw",
      rlKeys,
      RATE_LIMITS.passwordVerify,
    );
    if (limited.blocked) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSeconds) },
        },
      );
    }

    const { password, provider } = await request.json();

    // Validate required fields
    if (!password || !provider) {
      return NextResponse.json(
        { error: "Password and provider are required" },
        { status: 400 },
      );
    }

    // Validate provider
    if (!["google"].includes(provider)) {
      return NextResponse.json(
        { error: "Unsupported provider" },
        { status: 400 },
      );
    }

    // Get user with current accounts
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accounts: true },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: "User not found or no password set" },
        { status: 404 },
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
          ipAddress:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });

      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Correct password — reset the throttle counter.
    clearAttempts("link-pw", rlKeys);

    // Check if account is already linked
    const existingAccount = user.accounts.find(
      (acc) => acc.provider === provider,
    );
    if (existingAccount) {
      return NextResponse.json(
        { error: "Account already linked to this provider" },
        { status: 400 },
      );
    }

    // Log security event. It is the only thing this route writes: nothing is
    // linked here and no token is handed out. The account page starts the
    // Google sign-in next, and Auth.js links the account when Google returns.
    await prisma.securityEvent.create({
      data: {
        userId: user.id,
        eventType: "account_link_initiated",
        details: `Account linking initiated for provider: ${provider}`,
        success: true,
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        metadata: { provider },
      },
    });

    return NextResponse.json({ success: true, provider });
  } catch (error) {
    console.error("Account linking initiation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
