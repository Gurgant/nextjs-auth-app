"use client";

import { useRef, useCallback, useEffect, useMemo } from "react";

/**
 * Configuration options for useFormReset hook
 */
export interface UseFormResetOptions {
  /**
   * Callback fired after successful reset
   */
  onReset?: () => void;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom form name for logging
   */
  formName?: string;
}

/**
 * Return type for useFormReset hook
 */
export interface UseFormResetReturn<T extends HTMLFormElement> {
  /**
   * Form ref to attach to form element
   */
  formRef: React.RefObject<T | null>;

  /**
   * Safe reset function that handles edge cases
   */
  resetForm: () => void;

  /**
   * Check if form is currently mounted and valid
   */
  isFormValid: () => boolean;
}

/**
 * Custom hook for safe form reset with proper error handling and TypeScript safety
 *
 * @param options - Configuration options
 * @returns Form ref and reset utilities
 *
 * @example
 * ```tsx
 * const { formRef, resetForm } = useFormReset({
 *   formName: 'RegistrationForm',
 *   onReset: () => console.log('Form reset!')
 * })
 *
 * // In your component:
 * // <form ref={formRef} onSubmit={handleSubmit}>
 * //   ...form fields...
 * //   <button type="button" onClick={resetForm}>Reset</button>
 * // </form>
 * ```
 */
export function useFormReset<T extends HTMLFormElement = HTMLFormElement>(
  options: UseFormResetOptions = {},
): UseFormResetReturn<T> {
  const formRef = useRef<T>(null);
  const { onReset, debug, formName = "form" } = options;

  /**
   * Log helper for debugging
   */
  const log = useCallback(
    (message: string, ...args: any[]) => {
      if (debug) {
        console.log(`[useFormReset:${formName}] ${message}`, ...args);
      }
    },
    [debug, formName],
  );

  /**
   * Check if form is valid and mounted
   */
  const isFormValid = useCallback((): boolean => {
    if (!formRef.current) {
      log("Form ref is null");
      return false;
    }

    if (typeof formRef.current.reset !== "function") {
      log("Form reset method is not available");
      return false;
    }

    // Check if form is still in the DOM
    if (!document.body.contains(formRef.current)) {
      log("Form is not in the DOM");
      return false;
    }

    return true;
  }, [log]);

  /**
   * Safe form reset with comprehensive error handling
   */
  const resetForm = useCallback(() => {
    try {
      if (!isFormValid()) {
        log("Cannot reset form - validation failed");
        return;
      }

      // Get current form values for debugging
      if (debug && formRef.current) {
        const formData = new FormData(formRef.current);
        const entries = Array.from(formData.entries());
        log("Form data before reset:", entries);
      }

      // Perform the reset
      formRef.current!.reset();
      log("✅ Form reset successfully");

      // Clear any custom validity messages
      const inputs = formRef.current!.querySelectorAll(
        "input, textarea, select",
      );
      inputs.forEach((input) => {
        if ("setCustomValidity" in input) {
          (input as HTMLInputElement).setCustomValidity("");
        }
      });

      // Trigger change events on all inputs to update any controlled components
      inputs.forEach((input) => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Call onReset callback if provided
      if (onReset) {
        onReset();
      }
    } catch (error) {
      console.error(`[useFormReset:${formName}] Error resetting form:`, error);

      // Attempt fallback reset for individual fields
      try {
        if (formRef.current) {
          const inputs = formRef.current.querySelectorAll(
            "input, textarea, select",
          );
          inputs.forEach((input) => {
            if (
              input instanceof HTMLInputElement ||
              input instanceof HTMLTextAreaElement
            ) {
              input.value = "";
            } else if (input instanceof HTMLSelectElement) {
              input.selectedIndex = 0;
            }
          });
          log("Performed fallback reset on individual fields");
        }
      } catch (fallbackError) {
        console.error(
          `[useFormReset:${formName}] Fallback reset also failed:`,
          fallbackError,
        );
      }
    }
  }, [isFormValid, onReset, debug, formName, log]);

  /**
   * Reset form on unmount if debug mode (helps identify memory leaks)
   */
  useEffect(() => {
    const currentForm = formRef.current;
    return () => {
      if (debug && currentForm) {
        log("Component unmounting - checking for form cleanup");
      }
    };
  }, [debug, log]);

  return {
    formRef,
    resetForm,
    isFormValid,
  };
}

/**
 * Multiple form reset hook for managing several forms
 * This implementation avoids calling hooks inside loops by creating refs directly
 *
 * @param formNames Array of form identifiers
 * @param options Configuration options
 * @returns Object with refs and functions for each form
 *
 * @example
 * ```tsx
 * const { formRefs, resetForm, resetAllForms, isFormValid } = useMultipleFormReset(
 *   ['loginForm', 'signupForm'],
 *   { debug: true }
 * )
 *
 * return (
 *   <>
 *     <form ref={formRefs.loginForm}>...login fields...</form>
 *     <form ref={formRefs.signupForm}>...signup fields...</form>
 *     <button onClick={() => resetForm('loginForm')}>Reset Login</button>
 *     <button onClick={resetAllForms}>Reset All</button>
 *   </>
 * )
 * ```
 */
export function useMultipleFormReset<T extends Record<string, HTMLFormElement>>(
  formNames: (keyof T)[],
  options: UseFormResetOptions = {},
): {
  formRefs: { [K in keyof T]: React.RefObject<T[K] | null> };
  resetForm: (formName: keyof T) => void;
  resetAllForms: () => void;
  isFormValid: (formName: keyof T) => boolean;
} {
  const { debug, formName: baseFormName = "multiForm", onReset } = options;

  // Create refs for each form using useMemo to avoid recreating
  const formRefs = useMemo(() => {
    const refs = {} as { [K in keyof T]: React.RefObject<T[K] | null> };
    formNames.forEach((name) => {
      refs[name] = { current: null } as React.RefObject<T[typeof name] | null>;
    });
    return refs;
  }, [formNames]);

  // Log helper for debugging
  const log = useCallback(
    (message: string, ...args: any[]) => {
      if (debug) {
        console.log(
          `[useMultipleFormReset:${baseFormName}] ${message}`,
          ...args,
        );
      }
    },
    [debug, baseFormName],
  );

  // Reset function for a specific form
  const resetForm = useCallback(
    (formName: keyof T) => {
      const formRef = formRefs[formName];
      if (formRef?.current) {
        try {
          log(`Resetting form: ${String(formName)}`);
          formRef.current.reset();

          // Clear custom validity states
          const inputs = formRef.current.querySelectorAll(
            "input, select, textarea",
          );
          inputs.forEach((input: any) => {
            if (input.setCustomValidity) {
              input.setCustomValidity("");
            }
          });

          log(`Form reset successful: ${String(formName)}`);
          onReset?.();
        } catch (error) {
          log(`Form reset failed for ${String(formName)}:`, error);
        }
      } else {
        log(`Form ref not found: ${String(formName)}`);
      }
    },
    [formRefs, log, onReset],
  );

  // Reset all forms
  const resetAllForms = useCallback(() => {
    log("Resetting all forms");
    formNames.forEach((name) => {
      resetForm(name);
    });
  }, [formNames, resetForm, log]);

  // Check if a specific form is valid
  const isFormValid = useCallback(
    (formName: keyof T) => {
      const formRef = formRefs[formName];
      if (formRef?.current) {
        return formRef.current.checkValidity();
      }
      return false;
    },
    [formRefs],
  );

  return {
    formRefs,
    resetForm,
    resetAllForms,
    isFormValid,
  };
}
