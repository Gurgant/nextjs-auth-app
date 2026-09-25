import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { repositories } from "@/lib/repositories";
import { z } from "zod";
import { LRUCache } from "lru-cache";
import { loginEmailSchema, loginPasswordSchema } from "@/lib/validation";
import { decrypt } from "@/lib/security";
import { validateTOTPCode, validateBackupCode } from "@/lib/two-factor";
import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { resolveSessionMaxAge } from "@/lib/session-config";
import { CredentialsSignin } from "next-auth";
import type { User, Account } from "next-auth";
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

// Rate limiting configuration
const authRateLimiter = new LRUCache<string, number>({
  max: 500, // Store up to 500 unique email entries
  ttl: 60 * 1000, // 60 seconds (1 minute)
});

// Rate limit configuration (the LRU cache above expires entries after 60s)
const RATE_LIMIT_ATTEMPTS = parseInt(process.env.AUTH_RATE_LIMIT || "10");

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

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  trustHost: true, // Required for E2E tests and development
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
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
      async authorize(credentials) {
        // Validate and normalize input
        const validation = credentialsSchema.safeParse(credentials);
        if (!validation.success) {
          return null;
        }
        const { email, password } = validation.data;

        // Check rate limiting
        const attempts = authRateLimiter.get(email) || 0;
        if (attempts >= RATE_LIMIT_ATTEMPTS) {
          console.warn("Credentials login rate limit exceeded");
          return null;
        }

        // Verify credentials (password) via the repository
        let user;
        try {
          user = await repositories
            .getUserRepository()
            .findByCredentials(email, password);
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }

        if (!user) {
          authRateLimiter.set(email, attempts + 1);
          return null;
        }

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
            throw new TwoFactorInvalid();
          }

          // Successful 2FA verification — reset the failure counter.
          clearAttempts("2fa", [user.id]);
        }

        // Successful authentication
        authRateLimiter.delete(email);
        try {
          await repositories.getUserRepository().updateLastLogin(user.id);
        } catch (error) {
          console.error("Failed to update last login:", error);
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
              primaryAuthMethod:
                existingUser.primaryAuthMethod ||
                (account.provider === "google" ? "google" : "email"),
              lastLoginAt: new Date(),
              // Auto-verify email for Google login (Google OAuth ensures email verification)
              emailVerified:
                account.provider === "google"
                  ? new Date()
                  : existingUser.emailVerified,
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
    async jwt({ token, user }: JWTCallbackParams) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        token.emailVerified = user.emailVerified;
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
    async signIn(message: SignInEventMessage) {
      console.log("User signed in:", {
        userId: message.user.id,
        provider: message.account?.provider || "credentials",
        isNewUser: message.isNewUser,
      });
    },
    async signOut(message: any) {
      console.log("User signed out:", {
        userId: message.token?.sub,
      });
    },
    async createUser(message: any) {
      console.log("New user created:", {
        userId: message.user?.id,
        provider: message.account?.provider,
      });

      // Auto-verify email for new Google users
      if (message.account?.provider === "google" && message.user?.id) {
        try {
          const userRepo = repositories.getUserRepository();
          await userRepo.update(message.user.id, {
            emailVerified: new Date(),
          });
        } catch (error) {
          console.error(
            "Failed to auto-verify email for new Google user:",
            error,
          );
        }
      }
    },
    async linkAccount(message: any) {
      console.log("Account linked:", {
        userId: message.user?.id,
        provider: message.account?.provider,
      });
    },
  },
  debug: process.env.NODE_ENV === "development",
};
