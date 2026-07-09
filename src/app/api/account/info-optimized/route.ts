import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWithAccountDetails } from "@/lib/data-access/user-repository";

// Cache the response for 30 seconds to avoid repeated DB queries
export const dynamic = "force-dynamic";
export const revalidate = 30;

interface OptimizedAccountInfo {
  hasGoogleAccount: boolean;
  hasPassword: boolean;
  hasEmailAccount: boolean;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean;
  primaryAuthMethod?: string;
  createdAt: string;
  passwordSetAt?: string;
  backupCodesCount?: number;
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    // Add cache headers for client-side caching
    const responseHeaders = new Headers();
    responseHeaders.set("Cache-Control", "private, max-age=30");
    responseHeaders.set("Vary", "Cookie");

    try {
      // Use optimized repository method that fetches all needed data in one query
      const userWithDetails = await getUserWithAccountDetails(session.user.id);

      if (!userWithDetails) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
            data: getDefaultAccountInfo(),
          },
          { status: 404, headers: responseHeaders },
        );
      }

      const accountInfo: OptimizedAccountInfo = {
        hasGoogleAccount: userWithDetails.accounts.some(
          (account) => account.provider === "google",
        ),
        hasPassword: !!userWithDetails.password,
        hasEmailAccount: !!userWithDetails.password,
        emailVerified: !!userWithDetails.emailVerified,
        twoFactorEnabled: userWithDetails.twoFactorEnabled || false,
        primaryAuthMethod: determinePrimaryAuthMethod(userWithDetails),
        createdAt: userWithDetails.createdAt.toISOString(),
        passwordSetAt: userWithDetails.passwordSetAt?.toISOString(),
        backupCodesCount: userWithDetails.backupCodes?.length || 0,
      };

      return NextResponse.json(
        {
          success: true,
          data: accountInfo,
          cached: true,
        },
        { status: 200, headers: responseHeaders },
      );
    } catch (dbError) {
      console.error("Database error in account info:", dbError);

      // Return fallback data instead of failing completely
      return NextResponse.json(
        {
          success: true,
          data: getDefaultAccountInfo(),
          fallback: true,
          message: "Using cached data due to temporary issue",
        },
        { status: 200, headers: responseHeaders },
      );
    }
  } catch (error) {
    console.error("Error in optimized account info endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load account information",
        data: getDefaultAccountInfo(),
      },
      { status: 500 },
    );
  }
}

function determinePrimaryAuthMethod(user: any): string {
  // Determine primary auth method based on account creation patterns
  if (user.accounts.length > 0) {
    const googleAccount = user.accounts.find(
      (acc: any) => acc.provider === "google",
    );
    if (googleAccount && !user.password) {
      return "google";
    }
    if (googleAccount && user.password) {
      // Both methods available, use the oldest one as primary
      const passwordSetAt = user.passwordSetAt || user.createdAt;
      return passwordSetAt > googleAccount.createdAt ? "google" : "email";
    }
  }

  if (user.password) {
    return "email";
  }

  return "unknown";
}

function getDefaultAccountInfo(): OptimizedAccountInfo {
  return {
    hasGoogleAccount: false,
    hasPassword: false,
    hasEmailAccount: false,
    emailVerified: null,
    twoFactorEnabled: false,
    primaryAuthMethod: "unknown",
    createdAt: new Date().toISOString(),
  };
}
