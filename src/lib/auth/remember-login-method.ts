import { cookies } from "next/headers";
import { repositories } from "@/lib/repositories";
import {
  LAST_LOGIN_METHOD_COOKIE,
  LAST_LOGIN_METHOD_MAX_AGE,
  type LoginMethod,
} from "@/lib/auth/last-login-method";

/**
 * Records the method of a sign-in that has just succeeded: on the user row
 * (for the account page) and in a cookie (for the sign-in page, where the
 * visitor is not identified yet). Server only.
 *
 * Neither write may block the sign-in: a failure is logged and ignored.
 */
export async function rememberLoginMethod(
  userId: string | undefined,
  method: LoginMethod,
): Promise<void> {
  if (userId) {
    try {
      await repositories
        .getUserRepository()
        .update(userId, { lastLoginMethod: method });
    } catch (error) {
      console.error("Could not store the last sign-in method:", error);
    }
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(LAST_LOGIN_METHOD_COOKIE, method, {
      path: "/",
      maxAge: LAST_LOGIN_METHOD_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });
  } catch (error) {
    console.error("Could not set the last sign-in method cookie:", error);
  }
}
