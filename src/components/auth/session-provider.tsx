"use client";

import { SessionProvider } from "next-auth/react";

export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ultra-aggressive session settings for E2E tests
  const isTestEnvironment = process.env.NODE_ENV === "test";

  return (
    <SessionProvider
      // Base configuration for production
      refetchInterval={isTestEnvironment ? 1 : 5 * 60} // Ultra-frequent refresh for E2E tests
      refetchOnWindowFocus={true} // Always refetch on window focus
      refetchWhenOffline={false} // Don't refetch when offline
      basePath="/api/auth" // Explicit basePath for consistency
      // E2E-specific aggressive settings
      {...(isTestEnvironment && {
        refetchInterval: 1, // Refetch every second for E2E tests
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Additional stability for E2E
        keepAlive: 30, // Keep session alive longer
      })}
    >
      {children}
    </SessionProvider>
  );
}
