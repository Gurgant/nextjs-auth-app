import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

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

    // Generate secure linking token
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create account link request
    const linkRequest = await prisma.accountLinkRequest.create({
      data: {
        userId: user.id,
        requestType: `link_${provider}`,
        token,
        expires,
        metadata: {
          provider,
          initiatedAt: new Date().toISOString(),
          ipAddress:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
        },
      },
    });

    // Log security event
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
        metadata: {
          provider,
          linkRequestId: linkRequest.id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      linkToken: token,
      expiresAt: expires.toISOString(),
      provider,
    });
  } catch (error) {
    console.error("Account linking initiation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
