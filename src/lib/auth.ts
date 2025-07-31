import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password: true,
            twoFactorEnabled: true,
          },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) {
          return null;
        }

        // Basic authentication successful

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({
      user,
      account,
      profile,
    }: {
      user: any;
      account?: any;
      profile?: any;
    }) {
      // Handle account linking for OAuth providers
      if (account && account.provider !== 'credentials') {
        try {
          // Check if there's an existing user with the same email (different provider)
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { accounts: true, accountLinkRequests: true }
          })

          if (existingUser && !existingUser.accounts.some(acc => acc.provider === account.provider)) {
            // Check if there's a pending account link request
            const pendingLinkRequest = existingUser.accountLinkRequests.find(
              req => req.requestType === `link_${account.provider}` && 
                     !req.completed && 
                     req.expires > new Date()
            )

            if (pendingLinkRequest) {
              // Complete the account linking
              try {
                const response = await fetch(`${process.env.NEXTAUTH_URL}/api/auth/link-account/complete`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    linkToken: pendingLinkRequest.token,
                    oauthData: {
                      provider: account.provider,
                      providerAccountId: account.providerAccountId,
                      access_token: account.access_token,
                      refresh_token: account.refresh_token,
                      expires_at: account.expires_at,
                      token_type: account.token_type,
                      scope: account.scope,
                      id_token: account.id_token,
                      profile
                    }
                  })
                })

                if (response.ok) {
                  console.log('✅ Account linked successfully during OAuth callback')
                  // Update the user object to reflect the linked account
                  user.id = existingUser.id
                  return true
                } else {
                  console.error('❌ Failed to complete account linking:', await response.text())
                  return false
                }
              } catch (linkError) {
                console.error('❌ Error completing account linking:', linkError)
                return false
              }
            } else {
              // No pending link request - show the normal OAuth error
              console.log('🚫 OAuth account not linked and no pending link request')
              return false
            }
          }
        } catch (error) {
          console.error('Error in OAuth account linking check:', error)
          return false
        }
      }

      // Normal sign-in flow for existing users or credentials
      if (user.id && account) {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { accounts: true },
          });

          if (existingUser) {
            const hasGoogleAccount = existingUser.accounts.some(
              (acc) => acc.provider === "google"
            );
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
          // Don't block sign-in if metadata update fails
        }
      }
      return true;
    },
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
      }
      return token;
    },
    async session({
      session,
      token,
      user,
    }: {
      session: any;
      token: any;
      user: any;
    }) {
      if (token && session.user && token.id) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string;
      } else if (user && session.user && user.id) {
        session.user.id = user.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Handle language-aware redirects
      console.log("Auth redirect called with:", { url, baseUrl });

      const supportedLocales = ["en", "es", "fr", "it", "de"];

      // If it's a relative URL, handle it
      if (url.startsWith("/")) {
        const segments = url.split("/").filter(Boolean);
        const possibleLocale = segments[0];

        if (supportedLocales.includes(possibleLocale)) {
          // URL already has locale, ensure it goes to dashboard
          if (segments[1] === "dashboard") {
            return `${baseUrl}${url}`;
          } else if (segments[1] === "auth" && segments[2] === "2fa") {
            // Allow 2FA page redirects
            return `${baseUrl}${url}`;
          } else {
            return `${baseUrl}/${possibleLocale}/dashboard`;
          }
        } else {
          // No locale in URL, default to English and dashboard
          return `${baseUrl}/en/dashboard`;
        }
      }

      // Handle authentication errors - redirect all error URLs to our error page
      if (url.includes('error=')) {
        const urlObj = new URL(url.startsWith('http') ? url : `${baseUrl}${url}`)
        const errorType = urlObj.searchParams.get('error')
        
        if (errorType) {
          console.log('🚨 Auth error redirect:', errorType)
          return `${baseUrl}/en/auth/error?error=${errorType}`
        }
      }

      // Handle signin errors specifically (NextAuth redirects to /auth/signin?error=...)
      if (url.includes('/auth/signin') && url.includes('error=')) {
        const urlObj = new URL(url.startsWith('http') ? url : `${baseUrl}${url}`)
        const errorType = urlObj.searchParams.get('error')
        
        if (errorType) {
          console.log('🚨 SignIn error redirect:', errorType)
          return `${baseUrl}/en/auth/error?error=${errorType}`
        }
      }

      // If it's a callback URL on the same origin
      if (new URL(url).origin === baseUrl) {
        const urlObj = new URL(url);
        const segments = urlObj.pathname.split("/").filter(Boolean);
        const possibleLocale = segments[0];

        if (supportedLocales.includes(possibleLocale)) {
          return `${baseUrl}/${possibleLocale}/dashboard`;
        } else {
          return `${baseUrl}/en/dashboard`;
        }
      }

      // Default fallback to English dashboard
      return `${baseUrl}/en/dashboard`;
    },
  },
  pages: {
    signIn: "/en/auth/signin",
    error: "/en/auth/error",
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  debug: process.env.NODE_ENV === "development",
};

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(authOptions);
