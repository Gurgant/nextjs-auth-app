/**
 * Custom hook for safely extracting and validating locale in client components
 * 
 * @example
 * ```tsx
 * import { useSafeLocale } from '@/hooks/use-safe-locale'
 * 
 * export function MyComponent() {
 *   const locale = useSafeLocale() // Always returns a valid locale
 *   
 *   return <div>Current locale: {locale}</div>
 * }
 * ```
 */

'use client'

import { useParams } from 'next/navigation'
import { getSafeLocale, getSafeLocaleWithLogging, shouldLogSecurityEvents, type Locale } from '@/config/i18n'

/**
 * Hook to safely get the current locale in client components
 * 
 * @returns A validated locale string that is guaranteed to be one of the allowed locales
 */
export function useSafeLocale(): Locale {
  const params = useParams()
  
  // Extract locale from params (handle null params)
  const rawLocale = params?.locale
  
  // Use logging in development or when security logging is enabled
  if (shouldLogSecurityEvents() && rawLocale && !isKnownValidLocale(rawLocale)) {
    return getSafeLocaleWithLogging(rawLocale, {
      logInvalid: true,
      source: 'useSafeLocale'
    })
  }
  
  return getSafeLocale(rawLocale)
}

/**
 * Hook variant with explicit logging control
 * 
 * @param options - Configuration for logging behavior
 * @returns A validated locale string
 */
export function useSafeLocaleWithOptions(options?: {
  logInvalid?: boolean
  componentName?: string
}): Locale {
  const params = useParams()
  const rawLocale = params.locale
  
  return getSafeLocaleWithLogging(rawLocale, {
    logInvalid: options?.logInvalid ?? shouldLogSecurityEvents(),
    source: options?.componentName ? `useSafeLocale(${options.componentName})` : 'useSafeLocale'
  })
}

/**
 * Internal helper to check if we already know this is valid
 * Helps reduce unnecessary logging for valid locales
 */
function isKnownValidLocale(value: unknown): boolean {
  // Quick check without importing the validation function
  const validLocales = ['en', 'es', 'fr', 'it', 'de']
  return typeof value === 'string' && validLocales.includes(value)
}