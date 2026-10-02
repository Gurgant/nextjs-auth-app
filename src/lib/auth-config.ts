import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { repositories } from "@/lib/repositories";
import type { CredentialCheckResult } from "@/lib/repositories";
import { z } from "zod";
import { loginEmailSchema, loginPasswordSchema } from "@/lib/validation";
import { decrypt, getClientIP, logSecurityEvent } from "@/lib/security";
import { validateTOTPCode, validateBackupCode } from "@/lib/two-factor";
import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { getLockoutPolicy } from "@/lib/auth/lockout";
import { parseLoginMethod } from "@/lib/auth/last-login-method";
import { rememberLoginMethod } from "@/lib/auth/remember-login-method";
import { resolveEmailVerified } from "@/lib/auth/google-email-verification";
import { resolveSessionMaxAge } from "@/lib/session-config";
import { CredentialsSignin } from "next-auth";
import type { User, Account } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type {
  JWTCallbackParams,
  SessionCallbackParams,
  SignInEventMessage,
  // Note: Additional event message types available for future use:
  // SignOutEventMessage, CreateUserEventMessage, LinkAccountEventMessage, SessionEventMessage
  // These can be imported from "@/types/next-auth" when implementing comprehensive auth event handling
} from "@/types/next-auth";

// This file contains the core auth configuration without environment variable checks
// to prevent client-side import errors

// Credential sign-ins are throttled per email AND per client IP (in-memory,
// failure-counted) and, independently, locked per account in the database
// after repeated failures (src/lib/auth/lockout.ts).
const LOGIN_RL_SCOPE = "login";

// Input validation schema for credentials
const credentialsSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema,
});

// Custom credential errors so the client can distinguish 2FA states from a
// generic "invalid credentials" failure (surfaced via the signIn error `code`).
class TwoFactorRequired extends CredentialsSignin {
  code = "2fa_required";
}
class TwoFactorInvalid extends CredentialsSignin {
  code = "2fa_invalid";
}

interface LoginContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Count a failed attempt against an existing account and lock it at the
 * threshold. Never throws: this attempt is already rejected, so a storage
 * error must not turn into a different answer.
 */
async function registerFailedLogin(
  userId: string,
  trigger: "password" | "2fa",
  ctx: LoginContext,
): Promise<void> {
  try {
    const result = await repositories
      .getUserRepository()
      .registerFailedLogin(userId, getLockoutPolicy());
    if (result.lockedNow && result.lockedUntil) {
      await logSecurityEvent({
        userId,
        eventType: "account_locked",
        success: false,
        details: "Temporarily locked after repeated failed sign-in attempts",
        metadata: {
          trigger,
          attempts: result.attempts,
          lockedUntil: result.lockedUntil.toISOString(),
        },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
  } catch (error) {
    console.error("Failed to record failed login:", error);
  }
}

// Google sign-in is optional: the provider is registered only when both
// credentials are set (env.ts rejects setting just one), so the UI can ask
// /api/auth/providers whether to show it.
export const isGoogleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  trustHost: true, // Required for E2E tests and development
  providers: [
    ...(isGoogleConfigured
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "consent",
                access_type: "offline",
                response_type: "code",
              },
            },
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "email@example.com",
        },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text" },
        backupCode: { label: "Backup Code", type: "text" },
      },
      async authorize(credentials, request) {
        // Validate and normalize input (schema-invalid input is not counted)
        const validation = credentialsSchema.safeParse(credentials);
        if (!validation.success) {
          return null;
        }
        const { email, password } = validation.data;

        const headers = request?.headers;
        const ctx: LoginContext = {
          ip: headers ? getClientIP(headers) : undefined,
          userAgent: headers?.get("user-agent") ?? undefined,
        };
        const rlKeys = [email, ctx.ip];
        if (isRateLimited(LOGIN_RL_SCOPE, rlKeys, RATE_LIMITS.login).blocked) {
          console.warn("Credentials login rate limit exceeded");
          return null;
        }

        const userRepo = repositories.getUserRepository();
        let check: CredentialCheckResult;
        try {
          check = await userRepo.verifyCredentials(email, password);
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }

        if (check.status !== "valid") {
          recordAttempt(LOGIN_RL_SCOPE, rlKeys, RATE_LIMITS.login);
          if (check.status === "invalid" && check.userId) {
            await registerFailedLogin(check.userId, "password", ctx);
          }
          // Same answer for unknown email, wrong password and locked account
          // (an active lock is not extended).
          return null;
        }
        const user = check.user;

        // Enforce two-factor authentication when enabled. These throws are NOT
        // caught here, so their `code` reaches the client for the two-stage login.
        if (user.twoFactorEnabled) {
          const raw = (credentials ?? {}) as Record<string, unknown>;
          const totpCode =
            typeof raw.totpCode === "string" ? raw.totpCode.trim() : "";
          const backupCode =
            typeof raw.backupCode === "string" ? raw.backupCode.trim() : "";

          if (!totpCode && !backupCode) {
            throw new TwoFactorRequired();
          }

          // Throttle 2FA attempts per account — the 6-digit code space is only
          // ~1e6, so unthrottled guessing compromises the second factor quickly.
          // A code was submitted, so this is a genuine verification attempt.
          if (isRateLimited("2fa", [user.id], RATE_LIMITS.twoFactor).blocked) {
            throw new TwoFactorInvalid();
          }

          const tf = await prisma.user.findUnique({
            where: { id: user.id },
            select: { twoFactorSecret: true, backupCodes: true },
          });

          let ok = false;
          if (totpCode && tf?.twoFactorSecret) {
            try {
              ok = validateTOTPCode(totpCode, decrypt(tf.twoFactorSecret));
            } catch {
              ok = false;
            }
          }
          if (!ok && backupCode && tf?.backupCodes?.length) {
            const r = validateBackupCode(backupCode, tf.backupCodes);
            if (r.valid) {
              ok = true;
              // Consume the used backup code
              await prisma.user.update({
                where: { id: user.id },
                data: { backupCodes: r.remainingCodes },
              });
            }
          }

          if (!ok) {
            recordAttempt("2fa", [user.id], RATE_LIMITS.twoFactor);
            await registerFailedLogin(user.id, "2fa", ctx);
            throw new TwoFactorInvalid();
          }

          // Successful 2FA verification — reset the failure counter.
          clearAttempts("2fa", [user.id]);
        }

        // Successful authentication. Only the email counter is cleared: one
        // valid account must not reset an IP that is spraying other accounts.
        clearAttempts(LOGIN_RL_SCOPE, [email]);
        try {
          await userRepo.recordSuccessfulLogin(user.id);
        } catch (error) {
          console.error("Failed to record successful login:", error);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/en/auth/signin",
    error: "/en/auth/error",
  },
  session: {
    strategy: "jwt" as const,
    // Seconds; default 7 days, override with SESSION_MAX_AGE (validated at boot
    // by src/lib/env.ts). Sliding idle timeout: Auth.js re-issues the token on
    // every GET /api/auth/session. JWTs cannot be revoked one by one — see
    // SECURITY.md. (`updateAge` only applies to database sessions.)
    maxAge: resolveSessionMaxAge(),
  },
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // For signout, redirect to home page
      if (url.includes("/signout") || url.includes("/auth/signin")) {
        return `${baseUrl}/en`;
      }

      // Check if this is a post-login redirect - redirect to home page to show success message
      if (url === baseUrl || url === `${baseUrl}/` || url.includes("/en")) {
        // After successful login, redirect to home page to show login success page
        return `${baseUrl}/en`;
      }

      // Default redirect URL
      let redirectUrl = baseUrl;

      // If url is relative, make it absolute
      if (url.startsWith("/")) {
        redirectUrl = `${baseUrl}${url}`;
      } else if (url.startsWith(baseUrl)) {
        // If it's already an absolute URL to our site, use it
        redirectUrl = url;
      } else {
        // For external URLs, check if they're allowed
        try {
          const urlObj = new URL(url);
          // Only allow redirects to our own domain
          if (urlObj.origin === baseUrl) {
            redirectUrl = url;
          }
        } catch {
          // If URL parsing failed, use default redirect
        }
      }
      return redirectUrl;
    },
    async signIn(params: { user: User; account?: Account | null }) {
      const { user, account } = params;
      const result = true;

      // OAuth sign-in logic
      if (account?.provider === "google") {
        try {
          const userRepo = repositories.getUserRepository();
          const existingUser = await userRepo.findByEmailWithAccounts(
            user.email || "",
          );

          if (existingUser) {
            const hasGoogleAccount =
              existingUser.accounts?.some((acc) => acc.provider === "google") ||
              false;
            const hasPassword = !!existingUser.password;

            // Update user login metadata
            await userRepo.update(existingUser.id, {
              hasGoogleAccount: hasGoogleAccount,
              hasEmailAccount: hasPassword,
              lastLoginAt: new Date(),
              // Set password timestamps for existing password users
              passwordSetAt:
                existingUser.password && !existingUser.passwordSetAt
                  ? existingUser.createdAt
                  : existingUser.passwordSetAt,
              lastPasswordChange:
                existingUser.password && !existingUser.lastPasswordChange
                  ? existingUser.createdAt
                  : existingUser.lastPasswordChange,
            });
          }
        } catch (error) {
          console.error("Error updating user metadata on sign-in:", error);
          // Don't block sign-in if metadata update fails - keep result as true
        }
      }

      return result;
    },
    async jwt({ token, user, account, profile }: JWTCallbackParams) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        // The one place where a Google sign-in can mark the e-mail verified:
        // Auth.js has accepted the sign-in and the token is not encoded yet.
        token.emailVerified = await resolveEmailVerified({
          user,
          account,
          profile,
        });
        token.twoFactorEnabled = user.twoFactorEnabled;
        token.role = user.role || "USER";
        token.hasGoogleAccount = user.hasGoogleAccount;
        token.lastLoginAt = user.lastLoginAt;
      }
      return token;
    },
    async session({ session, token }: SessionCallbackParams) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.image;
        session.user.emailVerified = token.emailVerified;
        session.user.twoFactorEnabled = token.twoFactorEnabled;
        session.user.role = token.role || "USER";
        session.user.hasGoogleAccount = token.hasGoogleAccount;
        session.user.lastLoginAt = token.lastLoginAt;
      }
      return session;
    },
  },
  events: {
    // Fires once per successful sign-in, for every provider (for credentials
    // only after the password and, when enabled, the 2FA code were accepted).
    async signIn(message: SignInEventMessage) {
      const provider = message.account?.provider || "credentials";
      console.log("User signed in:", {
        userId: message.user.id,
        provider,
        isNewUser: message.isNewUser,
      });

      const method = parseLoginMethod(provider);
      if (method) {
        await rememberLoginMethod(message.user.id, method);
      }
    },
    async signOut(message: { token?: JWT | null; session?: unknown }) {
      console.log("User signed out:", {
        userId: message.token?.sub,
      });
    },
    // Auth.js passes the new user only: no account, so no provider.
    async createUser(message: { user: User }) {
      console.log("New user created:", {
        userId: message.user?.id,
      });
    },
    async linkAccount(message: { user: User; account: Account }) {
      console.log("Account linked:", {
        userId: message.user?.id,
        provider: message.account?.provider,
      });
    },
  },
  debug: process.env.NODE_ENV === "development",
};
