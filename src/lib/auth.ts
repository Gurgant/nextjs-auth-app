import NextAuth from "next-auth";
import { authOptions } from "./auth-config";

// Environment validation happens once at boot (src/lib/env.ts via
// instrumentation.ts). Google sign-in is optional and simply not offered when
// its credentials are missing (see isGoogleConfigured in auth-config.ts).

// Export authOptions from auth-config.ts
export { authOptions };

// Export NextAuth handler
export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);
