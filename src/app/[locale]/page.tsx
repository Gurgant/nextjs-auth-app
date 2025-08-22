"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SignInButton } from "@/components/auth/sign-in-button";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const t = useTranslations("Home");
  const tAuth = useTranslations("Auth");
  const { data: session } = useSession();
  const [showCredentials, setShowCredentials] = useState(false);
  const params = useParams();
  const currentLocale = (params.locale as string) || "en";

  if (session) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
              <Link
                href={`/${currentLocale}/dashboard`}
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
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {t("title")}
                </h1>
                <p className="text-gray-600 text-lg">{t("subtitle")}</p>
              </div>
            </div>
          </div>

          {/* Auth Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            {showCredentials ? (
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
                <SignInButton />
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
                  onClick={() => setShowCredentials(true)}
                  className="w-full text-blue-600 hover:text-blue-700 font-medium py-3 px-4 rounded-xl hover:bg-blue-50 transition-colors duration-200 border border-blue-200 hover:border-blue-300"
                >
                  {tAuth("signInWithEmail")}
                </button>
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
