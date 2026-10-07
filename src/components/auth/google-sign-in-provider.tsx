"use client";

import { createContext, type ReactNode } from "react";

/**
 * Whether the server offers Google sign-in, as the layout said it. `null`
 * where no provider is above: a component rendered on its own, as in a test.
 */
export const GoogleSignInContext = createContext<boolean | null>(null);

interface GoogleSignInProviderProps {
  /** What the server knows: is the Google provider registered? */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Hands the pages what the server knows about Google sign-in. The layout
 * reads it where the provider is registered (isGoogleConfigured in
 * src/lib/auth-config.ts) and passes the answer on as a boolean. This file
 * imports nothing from there: no server code follows it into the browser.
 *
 * With the answer in the first HTML a page shows from the start what it will
 * keep showing, and has nothing to ask (useGoogleSignInEnabled in
 * src/hooks/use-google-sign-in.ts).
 */
export function GoogleSignInProvider({
  enabled,
  children,
}: GoogleSignInProviderProps) {
  return (
    <GoogleSignInContext.Provider value={enabled}>
      {children}
    </GoogleSignInContext.Provider>
  );
}
