import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { LRUCache } from "lru-cache";
import { loginEmailSchema, loginPasswordSchema } from "@/lib/validation";
import type { User, Account } from "next-auth";

// This file contains the core auth configuration without environment variable checks
// to prevent client-side import errors

// Rate limiting configuration
const authRateLimiter = new LRUCache<string, number>({
  max: 500, // Store up to 500 unique email entries
  ttl: 60 * 1000, // 60 seconds (1 minute)
});

// Rate limit configuration
const RATE_LIMIT_ATTEMPTS = parseInt(process.env.AUTH_RATE_LIMIT || "10");
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Input validation schema for credentials
const credentialsSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema,
});

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
      },
      async authorize(credentials) {
        let result = null;

        try {
          // Validate and normalize input
          const validation = credentialsSchema.safeParse(credentials);
          if (!validation.success) {
            console.log("Invalid credentials format:", validation.error.flatten());
            return result;
          }

          const { email, password } = validation.data;

          // Check rate limiting
          const attempts = authRateLimiter.get(email) || 0;
          if (attempts >= RATE_LIMIT_ATTEMPTS) {
            console.log("Rate limit exceeded for email:", email);
            return result;
          }

          // Find user in database
          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              accounts: true,
            },
          });

          if (!user) {
            // Increment rate limit counter on failed attempt
            authRateLimiter.set(email, attempts + 1);
            console.log("User not found:", email);
            return result;
          }

          // Check if user has a password (some users might only use OAuth)
          if (!user.password) {
            console.log("User has no password (OAuth only account):", email);
            return result;
          }

          // Verify password
          const isValidPassword = await bcrypt.compare(password, user.password);
          if (!isValidPassword) {
            // Increment rate limit counter on failed attempt
            authRateLimiter.set(email, attempts + 1);
            console.log("Invalid password for user:", email);
            return result;
          }

          // Reset rate limit counter on successful login
          authRateLimiter.delete(email);

          // Check if the user's account is verified
          if (!user.emailVerified) {
            console.log("User email not verified:", email);
            // We still allow login but might want to remind them to verify
          }

          // Update last login timestamp
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          console.log("Successful login for user:", email);

          // Return user object for NextAuth session
          result = {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
          };
        } catch (error) {
          console.error("Authorize error:", error);
        }

        return result;
      },
    }),
  ],
  pages: {
    signIn: "/en/auth/signin",
    error: "/en/auth/error",
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      console.log("🔄 NextAuth redirect callback:", { url, baseUrl });
      
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
        } catch (e) {
          // If URL parsing failed, use default redirect
          console.log("URL parsing failed, using default redirect");
        }
      }
      return redirectUrl;
    },
    async signIn(params: { user: User; account?: Account | null }) {
      const { user, account } = params
      console.log("🔐 NextAuth signIn callback triggered:", {
        userId: user?.id,
        provider: account?.provider,
        email: user?.email,
      });

      let result = true;

      // OAuth sign-in logic
      if (account?.provider === "google") {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email || '' },
            include: {
              accounts: true,
            },
          });

          if (existingUser) {
            const hasGoogleAccount = (existingUser as any).accounts?.some(
              (acc: any) => acc.provider === "google"
            ) || false;
            const hasPassword = !!existingUser.password;

            // Update user login metadata
            await prisma.user.update({
              where: { id: user.id },
              data: {
                hasGoogleAccount: hasGoogleAccount,
                hasEmailAccount: hasPassword,
                primaryAuthMethod:
                  existingUser.primaryAuthMethod ||
                  (account.provider === "google" ? "google" : "email"),
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
              },
            });

            console.log("Updated user login metadata:", {
              userId: user.id,
              provider: account.provider,
              hasGoogleAccount,
              hasPassword,
              twoFactorEnabled: existingUser.twoFactorEnabled,
            });
          }
        } catch (error) {
          console.error("Error updating user metadata on sign-in:", error);
          // Don't block sign-in if metadata update fails - keep result as true
        }
      }
      
      return result;
    },
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        token.emailVerified = user.emailVerified;
        token.twoFactorEnabled = user.twoFactorEnabled;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.emailVerified = token.emailVerified;
        session.user.twoFactorEnabled = token.twoFactorEnabled;
      }
      return session;
    },
  },
  events: {
    async signIn(message: any) {
      console.log("✅ User signed in:", {
        userId: message.user?.id,
        email: message.user?.email,
        provider: message.account?.provider || "credentials",
      });
    },
    async signOut(message: any) {
      console.log("👋 User signed out:", {
        sessionToken: message.token?.sub,
      });
    },
    async createUser(message: any) {
      console.log("🆕 New user created:", {
        userId: message.user?.id,
        email: message.user?.email,
      });
    },
    async linkAccount(message: any) {
      console.log("🔗 Account linked:", {
        userId: message.user?.id,
        provider: message.account?.provider,
      });
    },
    async session(message: any) {
      // This can be very verbose, so only log in development
      if (process.env.NODE_ENV === "development") {
        console.log("📱 Session accessed");
      }
    },
  },
  debug: process.env.NODE_ENV === "development",
};