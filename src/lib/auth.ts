import NextAuth from "next-auth";
import { decode } from "next-auth/jwt";
import { authOptions } from "./auth-config";
import { createVerifiedDecode } from "./auth/session-revocation";

// Environment validation happens once at boot (src/lib/env.ts via
// instrumentation.ts). Google sign-in is optional and simply not offered when
// its credentials are missing (see isGoogleConfigured in auth-config.ts).

// Export authOptions from auth-config.ts
export { authOptions };

// Export NextAuth handler. `jwt.decode` is where a session is checked against
// the database (src/lib/auth/session-revocation.ts): Auth.js decodes the
// session cookie through it in the session endpoint, in auth(), at sign-out
// and in the OAuth callback, so a session that ended is "no session" for all
// of them. It is set here and not in auth-config.ts, which is loaded by tests
// that cannot import next-auth/jwt.
export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authOptions,
  jwt: { decode: createVerifiedDecode(decode) },
});
