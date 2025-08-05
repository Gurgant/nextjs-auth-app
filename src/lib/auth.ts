import NextAuth from "next-auth";
import { authOptions } from "./auth-config";

// Server-only validation
if (typeof window === 'undefined') {
  // Validate required environment variables
  const requiredEnvVars = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  };

  // Log configuration status (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 NextAuth Configuration Check:');
    Object.entries(requiredEnvVars).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? '✅ Set' : '❌ Missing'}`);
    });
  }

  // Log warning if critical env vars are missing
  if (!requiredEnvVars.GOOGLE_CLIENT_ID || !requiredEnvVars.GOOGLE_CLIENT_SECRET) {
    console.error('⚠️ Missing required Google OAuth environment variables:', {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    });
    console.error('Please check your .env.local file and restart the server.');
  }
}

// Export authOptions from auth-config.ts
export { authOptions };

// Export NextAuth handler
export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);