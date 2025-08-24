"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ActionResponse } from "@/lib/utils/form-responses";

/**
 * Configuration options for useActionState hook
 */
export interface UseActionStateOptions {
  /**
   * Callback fired on successful action
   */
  onSuccess?: (data?: any) => void | Promise<void>;

  /**
   * Callback fired on error
   */
  onError?: (error: ActionResponse) => void;

  /**
   * Auto-reset result after delay (ms)
   */
  resetDelay?: number;

  /**
   * Auto-reset only on success
   */
  resetOnSuccessOnly?: boolean;
}

/**
 * State and handlers returned by useActionState
 */
export interface UseActionStateReturn<T extends any[]> {
  /**
   * Current loading state
   */
  isLoading: boolean;

  /**
   * Current result (success or error)
   */
  result: ActionResponse | null;

  /**
   * Execute the action with loading state management
   */
  execute: (...args: T) => Promise<ActionResponse>;

  /**
   * Manually reset the state
   */
  reset: () => void;

  /**
   * Set result manually (useful for optimistic updates)
   */
  setResult: (result: ActionResponse | null) => void;
}

/**
 * Custom hook for managing async action state with automatic loading, error handling, and result management
 *
 * @param action - The async action function to execute
 * @param options - Configuration options
 * @returns State and handlers for the action
 *
 * @example
 * ```tsx
 * const { isLoading, result, execute, reset } = useActionState(
 *   registerUser,
 *   {
 *     onSuccess: () => router.push('/dashboard'),
 *     resetDelay: 3000
 *   }
 * )
 *
 * const handleSubmit = async (e: FormEvent) => {
 *   e.preventDefault()
 *   const formData = new FormData(e.currentTarget)
 *   await execute(formData)
 * }
 * ```
 */
export function useActionState<T extends any[]>(
  action: (...args: T) => Promise<ActionResponse>,
  options: UseActionStateOptions = {},
): UseActionStateReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ActionResponse | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Cleanup function for timeout
  const clearResetTimeout = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = undefined;
    }
  }, []);

  // Reset function
  const reset = useCallback(() => {
    setResult(null);
    clearResetTimeout();
  }, [clearResetTimeout]);

  // Execute action with state management
  const execute = useCallback(
    async (...args: T): Promise<ActionResponse> => {
      // Clear any pending reset
      clearResetTimeout();

      // Start loading
      setIsLoading(true);
      setResult(null);

      try {
        // Execute the action
        const response = await action(...args);

        // Update result
        setResult(response);

        // Handle callbacks
        if (response.success && options.onSuccess) {
          await options.onSuccess(response.data);
        } else if (!response.success && options.onError) {
          options.onError(response);
        }

        // Auto-reset if configured
        if (
          options.resetDelay &&
          (response.success || !options.resetOnSuccessOnly)
        ) {
          resetTimeoutRef.current = setTimeout(() => {
            reset();
          }, options.resetDelay);
        }

        return response;
      } catch (error) {
        // Handle unexpected errors
        console.error("Action execution error:", error);

        // Create error response
        const errorResponse: ActionResponse = {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        };

        setResult(errorResponse);

        if (options.onError) {
          options.onError(errorResponse);
        }

        return errorResponse;
      } finally {
        setIsLoading(false);
      }
    },
    [action, options, reset, clearResetTimeout],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearResetTimeout();
    };
  }, [clearResetTimeout]);

  return {
    isLoading,
    result,
    execute,
    reset,
    setResult,
  };
}

/**
 * Helper hook for actions that need FormData with locale
 */
export function useLocalizedAction<T extends [FormData, ...any[]]>(
  action: (...args: T) => Promise<ActionResponse>,
  locale: string,
  options: UseActionStateOptions = {},
): UseActionStateReturn<T> {
  const enhancedAction = useCallback(
    async (...args: T): Promise<ActionResponse> => {
      // Ensure locale is in FormData
      const [formData, ..._rest] = args;
      if (formData instanceof FormData && !formData.has("_locale")) {
        formData.append("_locale", locale);
      }
      return action(...args);
    },
    [action, locale],
  );

  return useActionState(enhancedAction, options);
}

// Re-export types for convenience
export type { ActionResponse } from "@/lib/utils/form-responses";
