/**
 * Centralized i18n configuration for secure locale handling
 * This file provides type-safe locale validation and utilities
 */

import { locales, type Locale } from '@/i18n'

// Re-export from the main i18n config for consistency
export const ALLOWED_LOCALES = locales
export type { Locale }

// Default locale
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Type guard to check if a value is a valid locale
 * @param value - The value to check
 * @returns True if the value is a valid locale
 */
export function isValidLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && 
    ALLOWED_LOCALES.includes(value as Locale)
  )
}

/**
 * Safely extract and validate a locale value
 * @param value - The value to validate
 * @returns A valid locale or the default locale
 */
export function getSafeLocale(value: unknown): Locale {
  return isValidLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * Enhanced version with optional logging for security monitoring
 * @param value - The value to validate
 * @param options - Optional configuration for logging
 * @returns A valid locale or the default locale
 */
export function getSafeLocaleWithLogging(
  value: unknown,
  options?: {
    logInvalid?: boolean
    source?: string
  }
): Locale {
  if (isValidLocale(value)) {
    return value
  }

  // Log invalid attempts for security monitoring
  if (options?.logInvalid) {
    const logMessage = `[Security] Invalid locale attempted: "${value}" from ${options.source || 'unknown source'}`
    
    if (process.env.NODE_ENV === 'development') {
      console.warn(logMessage)
    } else {
      // In production, you might want to send this to a monitoring service
      // Example: sendToMonitoringService({ type: 'invalid_locale', value, source: options.source })
      console.error(logMessage)
    }
  }

  return DEFAULT_LOCALE
}

/**
 * Get a typed array of locale codes
 * Useful for iterations and select options
 */
export function getLocaleOptions(): ReadonlyArray<Locale> {
  return Object.freeze([...ALLOWED_LOCALES])
}

/**
 * Check if we should log security events
 * Can be controlled via environment variable
 */
export function shouldLogSecurityEvents(): boolean {
  return process.env.NEXT_PUBLIC_LOG_SECURITY_EVENTS === 'true' || 
         process.env.NODE_ENV === 'development'
}