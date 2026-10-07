"use client";

import { useContext, useEffect, useState } from "react";
import { getProviders } from "next-auth/react";
import { GoogleSignInContext } from "@/components/auth/google-sign-in-provider";

// One request per page load, shared by every component that asks.
let googleEnabledPromise: Promise<boolean> | null = null;

function loadGoogleEnabled(): Promise<boolean> {
  googleEnabledPromise ??= getProviders()
    .then((providers) => Boolean(providers?.google))
    .catch(() => {
      googleEnabledPromise = null; // allow a retry on the next mount
      return false;
    });
  return googleEnabledPromise;
}

/**
 * Whether Google sign-in is available. The server registers the Google
 * provider only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both set
 * (src/lib/auth-config.ts), and the layout hands that answer to every page
 * (GoogleSignInProvider). Under it the hook answers at the first render, on
 * the server as in the browser, and asks nothing.
 *
 * Where no provider is above it (a component rendered on its own), it asks
 * /api/auth/providers and answers `null` until the list is there.
 */
export function useGoogleSignInEnabled(): boolean | null {
  const fromServer = useContext(GoogleSignInContext);
  const [asked, setAsked] = useState<boolean | null>(null);

  useEffect(() => {
    // The server has answered: nothing to ask.
    if (fromServer !== null) return undefined;

    let active = true;
    loadGoogleEnabled().then((value) => {
      if (active) setAsked(value);
    });
    return () => {
      active = false;
    };
  }, [fromServer]);

  return fromServer ?? asked;
}
