"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  level?: "page" | "section" | "component";
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorCount: number;
}

/**
 * Error boundary component for catching React errors
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: NodeJS.Timeout | null = null;
  private previousResetKeys: Array<string | number> = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorCount: 0,
    };
    this.previousResetKeys = props.resetKeys || [];
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props;
    const { errorCount } = this.state;

    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error, errorInfo);
    }

    // Call custom error handler
    if (onError) {
      onError(error, errorInfo);
    }

    // Update error count
    this.setState((prevState) => ({
      errorCount: prevState.errorCount + 1,
      errorInfo,
    }));

    // Send error to monitoring service
    this.reportError(error, errorInfo);

    // Auto-reset after 3 errors to prevent infinite loops
    if (errorCount >= 3) {
      this.scheduleReset(5000);
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError) {
      // Reset on prop changes if enabled
      if (resetOnPropsChange && prevProps.children !== this.props.children) {
        this.resetErrorBoundary();
      }

      // Reset if resetKeys changed
      if (resetKeys && this.previousResetKeys) {
        if (resetKeys.some((key, idx) => key !== this.previousResetKeys[idx])) {
          this.resetErrorBoundary();
          this.previousResetKeys = resetKeys;
        }
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorCount: 0,
    });
  };

  scheduleReset = (delay: number) => {
    this.resetTimeoutId = setTimeout(() => {
      this.resetErrorBoundary();
    }, delay);
  };

  reportError = (error: Error, errorInfo: ErrorInfo) => {
    // TODO: Integrate with error monitoring service
    // For now, just log to console
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      level: this.props.level || "component",
      url: typeof window !== "undefined" ? window.location.href : "unknown",
    };

    // Log error report for development/debugging
    console.error("Error Boundary Report:", errorReport);

    if (process.env.NODE_ENV === "production") {
      // Send to monitoring service
      // Example: sendToSentry(errorReport)
    }
  };

  render() {
    const { hasError, error, errorCount } = this.state;
    const { children, fallback, isolate, level = "component" } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Use default error UI based on level
      switch (level) {
        case "page":
          return (
            <PageErrorFallback
              error={error}
              reset={this.resetErrorBoundary}
              errorCount={errorCount}
            />
          );
        case "section":
          return (
            <SectionErrorFallback
              error={error}
              reset={this.resetErrorBoundary}
              _errorCount={errorCount}
            />
          );
        default:
          return (
            <ComponentErrorFallback
              error={error}
              reset={this.resetErrorBoundary}
              _errorCount={errorCount}
              isolate={isolate}
            />
          );
      }
    }

    return children;
  }
}

/**
 * Page-level error fallback
 */
function PageErrorFallback({
  error,
  reset,
  errorCount,
}: {
  error: Error;
  reset: () => void;
  errorCount: number;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. The issue has been logged and
            we&apos;ll look into it.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="text-left bg-muted p-4 rounded-lg">
            <p className="font-mono text-sm text-destructive">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="outline"
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </div>

        {errorCount > 1 && (
          <p className="text-sm text-muted-foreground">
            Error occurred {errorCount} times
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Section-level error fallback
 */
function SectionErrorFallback({
  error,
  reset,
  _errorCount,
}: {
  error: Error;
  reset: () => void;
  _errorCount: number;
}) {
  return (
    <div className="p-8 text-center space-y-4 border border-destructive/20 rounded-lg bg-destructive/5">
      <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
      <div className="space-y-2">
        <h3 className="font-semibold">Failed to load this section</h3>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred"}
        </p>
      </div>
      <Button onClick={reset} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}

/**
 * Component-level error fallback
 */
function ComponentErrorFallback({
  error,
  reset,
  _errorCount,
  isolate,
}: {
  error: Error;
  reset: () => void;
  _errorCount: number;
  isolate?: boolean;
}) {
  if (isolate) {
    // Minimal UI for isolated components
    return (
      <div className="p-2 text-center">
        <button
          onClick={reset}
          className="text-sm text-destructive hover:underline"
        >
          Failed to load - click to retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 text-center space-y-2 border border-destructive/20 rounded bg-destructive/5">
      <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
      <p className="text-sm">Component failed to load</p>
      <button onClick={reset} className="text-sm text-primary hover:underline">
        Try again
      </button>
    </div>
  );
}

/**
 * Hook for using error boundary imperatively
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return {
    throwError: (error: Error) => setError(error),
    clearError: () => setError(null),
  };
}

/**
 * Higher-order component for adding error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}
