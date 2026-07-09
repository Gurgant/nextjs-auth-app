"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { ErrorBoundary } from "./error-boundary";

interface ErrorContext {
  errors: ErrorRecord[];
  addError: (error: ErrorRecord) => void;
  removeError: (id: string) => void;
  clearErrors: () => void;
  handleError: (error: unknown, context?: ErrorContextData) => void;
}

interface ErrorRecord {
  id: string;
  error: Error;
  timestamp: Date;
  context?: ErrorContextData;
  dismissed?: boolean;
}

interface ErrorContextData {
  component?: string;
  action?: string;
  userId?: string;
  [key: string]: any;
}

const ErrorContext = createContext<ErrorContext | undefined>(undefined);

/**
 * Error provider component
 */
export function ErrorProvider({
  children,
  maxErrors = 10,
  autoDismiss = true,
  autoDismissDelay = 5000,
}: {
  children: ReactNode;
  maxErrors?: number;
  autoDismiss?: boolean;
  autoDismissDelay?: number;
}) {
  const [errors, setErrors] = useState<ErrorRecord[]>([]);

  const removeError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addError = useCallback(
    (error: ErrorRecord) => {
      setErrors((prev) => {
        // Limit stored errors
        const newErrors = [error, ...prev].slice(0, maxErrors);

        // Auto-dismiss after delay
        if (autoDismiss) {
          setTimeout(() => {
            removeError(error.id);
          }, autoDismissDelay);
        }

        return newErrors;
      });

      // TODO: Show notification for user-facing errors
      // You can integrate your preferred toast/notification system here
      if (isUserFacingError(error.error)) {
        console.error("User-facing error:", error.error.message);
      }
    },
    [maxErrors, autoDismiss, autoDismissDelay, removeError],
  );

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const handleError = useCallback(
    (error: unknown, context?: ErrorContextData) => {
      const errorRecord: ErrorRecord = {
        id: generateErrorId(),
        error: normalizeError(error),
        timestamp: new Date(),
        context,
      };

      // Log error in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error handled:", errorRecord);
      }

      // Add to error list
      addError(errorRecord);

      // Report to monitoring service
      reportError(errorRecord);
    },
    [addError],
  );

  const value: ErrorContext = {
    errors,
    addError,
    removeError,
    clearErrors,
    handleError,
  };

  return (
    <ErrorContext.Provider value={value}>
      <ErrorBoundary
        level="page"
        onError={(error, errorInfo) => {
          handleError(error, {
            component: "Root",
            errorInfo: errorInfo.componentStack,
          });
        }}
      >
        {children}
      </ErrorBoundary>
    </ErrorContext.Provider>
  );
}

/**
 * Hook for using error context
 */
export function useErrorContext() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useErrorContext must be used within ErrorProvider");
  }
  return context;
}

/**
 * Hook for handling async errors
 */
export function useAsyncError() {
  const { handleError } = useErrorContext();

  return useCallback(
    (error: unknown) => {
      handleError(error, { source: "async" });
    },
    [handleError],
  );
}

/**
 * Hook for wrapping async functions with error handling
 */
export function useErrorWrapper() {
  const { handleError } = useErrorContext();

  return useCallback(
    <T extends (...args: any[]) => Promise<any>>(
      fn: T,
      context?: ErrorContextData,
    ): T => {
      return (async (...args) => {
        try {
          return await fn(...args);
        } catch (error) {
          handleError(error, context);
          throw error;
        }
      }) as T;
    },
    [handleError],
  );
}

/**
 * Normalize unknown errors to Error objects
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as any;
    return new Error(errorObj.message || JSON.stringify(error));
  }

  return new Error("An unknown error occurred");
}

/**
 * Check if error should be shown to user
 */
function isUserFacingError(error: Error): boolean {
  // Add logic to determine if error should be shown to user
  // For now, show all errors except network/fetch errors
  return !error.message.toLowerCase().includes("fetch");
}

/**
 * Generate unique error ID
 */
function generateErrorId(): string {
  return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Report error to monitoring service
 */
function reportError(error: ErrorRecord) {
  // TODO: Integrate with monitoring service
  if (process.env.NODE_ENV === "production") {
    // Example: sendToSentry(error)
  }
}

/**
 * Error display component
 */
export function ErrorDisplay() {
  const { errors, removeError } = useErrorContext();
  const visibleErrors = errors.filter((e) => !e.dismissed);

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {visibleErrors.map((error) => (
        <div
          key={error.id}
          className="bg-destructive text-destructive-foreground p-4 rounded-lg shadow-lg flex items-start gap-3"
        >
          <div className="flex-1">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{error.error.message}</p>
            {error.context?.component && (
              <p className="text-xs mt-1 opacity-70">
                Component: {error.context.component}
              </p>
            )}
          </div>
          <button
            onClick={() => removeError(error.id)}
            className="text-destructive-foreground/70 hover:text-destructive-foreground"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
