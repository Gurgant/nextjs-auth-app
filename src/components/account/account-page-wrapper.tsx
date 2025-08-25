"use client";

import { Suspense, lazy, memo, Component, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trackAccountPageMetrics } from "@/lib/performance/web-vitals";

// Lazy load the heavy components
const AccountManagementOptimized = lazy(() =>
  import("./account-management-optimized").then((mod) => ({
    default: mod.AccountManagement,
  })),
);

interface AccountPageWrapperProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  locale: string;
}

// Loading fallback component
const AccountLoadingFallback = memo(function AccountLoadingFallback() {
  const t = useTranslations("LoadingStates");

  return (
    <div className="min-h-screen">
      {/* Header Skeleton */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg animate-pulse">
          <div className="w-10 h-10 bg-gray-500 rounded-full"></div>
        </div>
        <div className="h-8 bg-gray-300 rounded mx-auto w-64 mb-2 animate-pulse"></div>
        <div className="h-6 bg-gray-200 rounded mx-auto w-48 animate-pulse"></div>
      </div>

      {/* Account Providers Skeleton */}
      <div className="mb-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gray-300 rounded-xl animate-pulse"></div>
            <div className="h-6 bg-gray-300 rounded w-48 animate-pulse"></div>
          </div>
          <div className="space-y-4">
            <div className="h-16 bg-gray-200 rounded-xl animate-pulse"></div>
            <div className="h-16 bg-gray-200 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Grid Layout Skeleton */}
      <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20"
          >
            <div className="flex items-center space-x-4 mb-6">
              <div className="w-12 h-12 bg-gray-300 rounded-xl animate-pulse"></div>
              <div className="h-6 bg-gray-300 rounded w-32 animate-pulse"></div>
            </div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading text */}
      <div className="text-center mt-8">
        <p className="text-gray-600">{t("loadingAccountData")}</p>
      </div>
    </div>
  );
});

// Simple Error Boundary implementation
class AccountErrorBoundary extends Component<
  {
    children: React.ReactNode;
    onError?: (error: Error, errorInfo: any) => void;
  },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: {
    children: React.ReactNode;
    onError?: (error: Error, errorInfo: any) => void;
  }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Account page error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AccountErrorFallback
          error={this.state.error!}
          resetErrorBoundary={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
        />
      );
    }

    return this.props.children;
  }
}

// Error fallback component
const AccountErrorFallback = memo(function AccountErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-red-200/50 max-w-lg mx-auto">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
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
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-red-900 mb-2">
            Account Loading Error
          </h2>
          <p className="text-gray-600 mb-4">
            There was an error loading your account page. Please try again.
          </p>
          <p className="text-sm text-red-600 mb-6 font-mono bg-red-50 p-2 rounded">
            {error.message}
          </p>
          <button
            onClick={resetErrorBoundary}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
          >
            <svg
              className="w-4 h-4 mr-2"
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
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
});

export const AccountPageWrapper = memo(function AccountPageWrapper({
  user,
  locale,
}: AccountPageWrapperProps) {
  useEffect(() => {
    // Initialize performance tracking for account page
    trackAccountPageMetrics();
  }, []);

  return (
    <AccountErrorBoundary
      onError={(error, errorInfo) => {
        console.error("Account page error:", error, errorInfo);
        // Could add error reporting service here
      }}
    >
      <Suspense fallback={<AccountLoadingFallback />}>
        <AccountManagementOptimized user={user} locale={locale} />
      </Suspense>
    </AccountErrorBoundary>
  );
});
