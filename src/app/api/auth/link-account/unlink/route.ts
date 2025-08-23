import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function DELETE(request: NextRequest) {
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
          eventType: "account_unlink_failed",
          details: "Password verification failed during account unlinking",
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

    // Find the account to unlink
    const accountToUnlink = user.accounts.find(
      (acc) => acc.provider === provider,
    );
    if (!accountToUnlink) {
      return NextResponse.json(
        { error: "Account not linked to this provider" },
        { status: 404 },
      );
    }

    // Check if user has at least one other auth method
    const hasCredentials = !!user.password;
    const hasOtherProviders =
      user.accounts.filter((acc) => acc.provider !== provider).length > 0;

    if (!hasCredentials && !hasOtherProviders) {
      return NextResponse.json(
        { error: "Cannot unlink the only authentication method" },
        { status: 400 },
      );
    }

    // Perform the unlink operation
    const result = await prisma.$transaction(async (tx) => {
      // Delete the account
      await tx.account.delete({
        where: { id: accountToUnlink.id },
      });

      // Update user flags
      const updateData: any = {};
      if (provider === "google") {
        updateData.hasGoogleAccount = false;

        // If Google was the primary auth method, switch to email
        if (user.primaryAuthMethod === "google" && hasCredentials) {
          updateData.primaryAuthMethod = "email";
        }
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
          ipAddress:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
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
    return NextResponse.json(
      { error: "Failed to unlink account" },
      { status: 500 },
    );
  }
}
