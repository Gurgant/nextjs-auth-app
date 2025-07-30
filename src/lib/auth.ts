import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const { 
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string
          }
        })

        if (!user || !user.password) {
          return null
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.image = user.image
      }
      return token
    },
    async session({ session, token, user }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.image as string
      } else if (user && session.user) {
        session.user.id = user.id
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Handle language-aware redirects
      console.log('Auth redirect called with:', { url, baseUrl })
      
      const supportedLocales = ['en', 'es', 'fr', 'it', 'de']
      
      // If it's a relative URL, handle it
      if (url.startsWith("/")) {
        const segments = url.split('/').filter(Boolean)
        const possibleLocale = segments[0]
        
        if (supportedLocales.includes(possibleLocale)) {
          // URL already has locale, ensure it goes to dashboard
          if (segments[1] === 'dashboard') {
            return `${baseUrl}${url}`
          } else {
            return `${baseUrl}/${possibleLocale}/dashboard`
          }
        } else {
          // No locale in URL, default to English and dashboard
          return `${baseUrl}/en/dashboard`
        }
      }
      
      // If it's a callback URL on the same origin
      else if (new URL(url).origin === baseUrl) {
        const urlObj = new URL(url)
        const segments = urlObj.pathname.split('/').filter(Boolean)
        const possibleLocale = segments[0]
        
        if (supportedLocales.includes(possibleLocale)) {
          return `${baseUrl}/${possibleLocale}/dashboard`
        } else {
          return `${baseUrl}/en/dashboard`
        }
      }
      
      // Default fallback to English dashboard
      return `${baseUrl}/en/dashboard`
    },
  },
  pages: {
    signIn: '/[locale]',
    error: '/[locale]',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  debug: process.env.NODE_ENV === "development",
})