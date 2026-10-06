"use client";

import { SessionProvider } from "next-auth/react";

// The same settings in every environment: the E2E suite runs against
// `next dev`, so it gets these too.
export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider
      refetchInterval={5 * 60} // seconds
      refetchOnWindowFocus={true}
      refetchWhenOffline={false}
      basePath="/api/auth"
    >
      {children}
    </SessionProvider>
  );
}
