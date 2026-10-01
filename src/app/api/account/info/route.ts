import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWithAccountDetails } from "@/lib/data-access/user-repository";
import type { UserWithAccountDetails } from "@/lib/repositories/user/user.repository.interface";

// Security state (2FA, linked providers) must never be served stale.
export const dynamic = "force-dynamic";

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

export async function GET(_request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    // Never cache: right after enabling 2FA the page refetches this and must
    // see the new state (a 30 s private cache used to show "Disabled").
    const responseHeaders = new Headers();
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("Vary", "Cookie");

    try {
      // Use optimized repository method that fetches all needed data in one query
      const userWithDetails = await getUserWithAccountDetails(session.user.id);

      if (!userWithDetails) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
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
        },
        { status: 200, headers: responseHeaders },
      );
    } catch (dbError) {
      console.error("Database error in account info:", dbError);

      // Fail honestly: made-up defaults would show a 2FA-protected account
      // as unprotected.
      return NextResponse.json(
        {
          success: false,
          message: "Account information is temporarily unavailable",
        },
        { status: 503, headers: responseHeaders },
      );
    }
  } catch (error) {
    console.error("Error in optimized account info endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load account information",
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

function determinePrimaryAuthMethod(user: UserWithAccountDetails): string {
  // Determine primary auth method based on account creation patterns
  if (user.accounts.length > 0) {
    const googleAccount = user.accounts.find(
      (acc) => acc.provider === "google",
    );
    if (googleAccount && !user.password) {
      return "google";
    }
    if (googleAccount && user.password) {
      // Both methods available. Account has no creation date, so the older
      // method cannot be determined: deciding by age needs a schema change.
      return "email";
    }
  }

  if (user.password) {
    return "email";
  }

  return "unknown";
}
