"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { SignInButton } from "@/components/auth/sign-in-button";
import { useGoogleSignInEnabled } from "@/hooks/use-google-sign-in";
import { useLastLoginMethod } from "@/hooks/use-last-login-method";
import { LastUsedBadge } from "@/components/auth/last-used-badge";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { getRoleDashboardPath } from "@/lib/auth/roles";
import type { Role } from "@/lib/types/prisma";
import Link from "next/link";
import type { Route } from "next";

export default function HomePage() {
  const t = useTranslations("Home");
  const tAuth = useTranslations("Auth");
  const { data: session, status } = useSession();
  const [showCredentials, setShowCredentials] = useState(false);
  // Without Google configured, the email form is the only way in: show it
  // directly instead of a one-option chooser. The layout hands the answer
  // down with the page, so it is known at the first render, on the server
  // too; it is null only where no provider is above this page.
  const googleEnabled = useGoogleSignInEnabled();
  // Only shown in the two-option chooser: with one method there is nothing
  // to tell apart.
  const lastLoginMethod = useLastLoginMethod();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [sessionEstablished, setSessionEstablished] = useState(false);
  const params = useParams();
  const currentLocale = (params.locale as string) || "en";

  // Simplified session establishment for E2E tests
  useEffect(() => {
    if (status !== "loading") {
      const delay = process.env.NODE_ENV === "test" ? 1000 : 300;
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
        if (process.env.NODE_ENV === "test") {
          setSessionEstablished(true);
          console.log("🔐 E2E Session timing completed:", {
            hasSession: !!session,
            userEmail: session?.user?.email,
            status,
          });
        }
      }, delay);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, session]);

  // Immediate session validation for authenticated users in E2E
  useEffect(() => {
    if (process.env.NODE_ENV === "test" && session?.user?.email) {
      setSessionEstablished(true);
      console.log(
        "🎯 E2E Session immediately established for:",
        session.user.email,
      );
    }
  }, [session]);

  // Show loading only when we have a session but it's still loading
  // isInitialLoad provides timing buffer for session restoration after page refreshes
  // If no session exists, show login form immediately (critical for E2E tests)
  const shouldShowLoading = status === "loading" && session;

  // Use isInitialLoad for debugging timing issues
  if (process.env.NODE_ENV === "test" && isInitialLoad) {
    console.log("🔄 Initial load state:", {
      status,
      hasSession: !!session,
      isInitialLoad,
    });
  }

  if (shouldShowLoading) {
    return (
      <div
        className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50"
        data-testid="session-loading"
      >
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-pulse">
              <svg
                className="w-8 h-8 text-white animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <p className="text-gray-600">Loading...</p>
            {/* Debug info for E2E tests */}
            {process.env.NODE_ENV === "test" && (
              <div className="text-xs text-gray-500 mt-4">
                Session Status: {status} | Session: {JSON.stringify(!!session)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (session) {
    // Enhanced debug logging for E2E tests
    if (process.env.NODE_ENV === "test") {
      console.log("🏠 Authenticated home page rendering", {
        hasSession: !!session,
        userEmail: session.user?.email,
        userRole: session.user?.role,
        status,
        sessionEstablished,
      });
    }

    return (
      <div
        className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50"
        data-testid="authenticated-home"
        data-session-email={session.user?.email}
        data-user-role={session.user?.role}
        data-session-status={status}
      >
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
          <div className="text-center space-y-8 max-w-md">
            <div className="space-y-4">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {t("welcomeBack", {
                  name: session.user?.name || session.user?.email || "User",
                })}
              </h2>
              <p className="text-gray-600">{t("successfullySignedIn")}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 space-y-4">
              {/* Enhanced debug info for E2E tests */}
              {process.env.NODE_ENV === "test" && (
                <div className="text-xs text-green-600 mb-2 p-2 bg-green-50 rounded">
                  ✅ Authenticated State Confirmed | User: {session.user?.email}{" "}
                  | Role: {session.user?.role} | Status: {status} | Established:{" "}
                  {sessionEstablished ? "Yes" : "No"}
                </div>
              )}
              <Link
                href={
                  getRoleDashboardPath(
                    (session?.user?.role as Role) || "USER",
                    currentLocale,
                  ) as Route
                }
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium py-3 px-6 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                prefetch={false}
                scroll={false}
                data-testid="go-to-dashboard-button"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                {tAuth("goToDashboard")}
              </Link>
              <SignInButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50"
      data-testid="signed-out-home"
      // "loading" in the HTML of the server and until the browser's own
      // request for the session is answered: the one thing on this page that
      // tells a page that React has taken over from one that has only arrived.
      data-session-status={status}
    >
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <div className="w-full max-w-md">
          {/* Hero Section */}
          <div className="text-center space-y-8 mb-8">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <div className="space-y-2">
                {/* Two lines in most languages and on a phone: balanced, so
                    that the second is not one short word under the first. */}
                <h1 className="text-4xl font-bold text-balance bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {t("title")}
                </h1>
                {/* How one can sign in here. The sentence that names Google
                    is true only where Google is configured. The answer
                    comes with the page, so the sentence is in the first
                    HTML and nothing moves afterwards. Without an answer
                    (no provider above the page) the line says nothing:
                    either sentence could be the wrong one. */}
                <p
                  className="text-gray-600 text-lg text-balance"
                  data-testid="home-subtitle"
                >
                  {googleEnabled === null
                    ? null
                    : googleEnabled
                      ? t("subtitle")
                      : t("subtitleWithoutGoogle")}
                </p>
              </div>
            </div>
          </div>

          {/* Auth Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            {showCredentials || googleEnabled === false ? (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {tAuth("signInToAccount")}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {tAuth("enterCredentials")}
                  </p>
                </div>
                <CredentialsForm />
                {googleEnabled !== false && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-white text-gray-500 font-medium">
                          {tAuth("or")}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCredentials(false)}
                      className="w-full text-blue-600 hover:text-blue-700 font-medium py-2 px-4 rounded-xl hover:bg-blue-50 transition-colors duration-200"
                    >
                      {tAuth("signInWithGoogleInstead")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {tAuth("welcomeBack")}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {tAuth("chooseSignInMethod")}
                  </p>
                </div>
                <div className="relative">
                  <SignInButton />
                  {googleEnabled && lastLoginMethod === "google" && (
                    <LastUsedBadge method="google" />
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500 font-medium">
                      {tAuth("or")}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowCredentials(true)}
                    className="w-full text-blue-600 hover:text-blue-700 font-medium py-3 px-4 rounded-xl hover:bg-blue-50 transition-colors duration-200 border border-blue-200 hover:border-blue-300"
                    data-testid="sign-in-with-email-toggle"
                  >
                    {tAuth("signInWithEmail")}
                  </button>
                  {googleEnabled && lastLoginMethod === "credentials" && (
                    <LastUsedBadge method="credentials" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Registration Link */}
          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              {tAuth("dontHaveAccount")}{" "}
              <Link
                href={`/${currentLocale}/register`}
                className="font-medium text-green-600 hover:text-green-700 transition-colors duration-200"
              >
                {tAuth("registerHere")}
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-gray-500 text-sm">{t("secureAuth")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
