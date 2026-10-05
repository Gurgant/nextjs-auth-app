import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWithAccountDetails } from "@/lib/data-access/user-repository";
import {
  parseLoginMethod,
  type LoginMethod,
} from "@/lib/auth/last-login-method";

// Security state (2FA, linked providers) must never be served stale.
export const dynamic = "force-dynamic";

interface OptimizedAccountInfo {
  hasGoogleAccount: boolean;
  hasPassword: boolean;
  hasEmailAccount: boolean;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean;
  /** The method of the last successful sign-in, null if none is recorded. */
  lastLoginMethod: LoginMethod | null;
  createdAt: string;
  passwordSetAt?: string;
  backupCodesCount?: number;
}

// The route does not know the language of the page that asks. Each failure
// names itself with a `code`, and the account page says it in its own
// language (src/hooks/use-account-data.ts); `message` is English, for other
// clients, and is not shown there.
export async function GET(_request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, code: "unauthorized", message: "Unauthorized" },
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
            code: "userNotFound",
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
        lastLoginMethod: parseLoginMethod(userWithDetails.lastLoginMethod),
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
          code: "accountInfoUnavailable",
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
        code: "failedToLoadAccountInfo",
        message: "Failed to load account information",
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
