"use client";

import { useActionState, type UseActionStateOptions } from "./use-action-state";
import { appendLocaleToFormData } from "@/lib/utils/form-locale";
import type { ActionResponse } from "@/lib/utils/form-responses";

/**
 * A wrapper around useActionState that automatically appends locale to FormData
 * This ensures locale is preserved in all form submissions
 */
export function useLocalizedAction<T extends readonly [FormData, ...unknown[]]>(
  action: (...args: T) => Promise<ActionResponse>,
  locale: string,
  options?: UseActionStateOptions,
) {
  // Wrap the action to handle locale injection
  const localizedAction = async (...args: T): Promise<ActionResponse> => {
    // Append the locale when the first argument is FormData, preserving any
    // locale a caller already set explicitly.
    if (args[0] instanceof FormData && !args[0].has("_locale")) {
      appendLocaleToFormData(args[0] as FormData, locale);
    }

    return action(...args);
  };

  return useActionState(localizedAction, options);
}
