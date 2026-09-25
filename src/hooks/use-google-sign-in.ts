"use client";

import { useEffect, useState } from "react";
import { getProviders } from "next-auth/react";

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
 * (src/lib/auth-config.ts). `null` while the provider list is loading.
 */
export function useGoogleSignInEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    loadGoogleEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
