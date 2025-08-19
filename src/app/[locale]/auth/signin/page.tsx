'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LoadingLayout } from '@/components/layouts'
import { useSafeLocale } from '@/hooks/use-safe-locale'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('LoadingStates')
  
  // Use safe locale extraction
  const locale = useSafeLocale()
  
  useEffect(() => {
    const error = searchParams.get('error')
    
    if (error) {
      // If there's an error parameter, redirect to our error page
      console.log('🚨 SignIn page: Redirecting error to error page:', error)
      router.replace(`/${locale}/auth/error?error=${error}`)
      return
    }
    
    // If no error, redirect to the main sign-in page (home)
    router.replace(`/${locale}`)
  }, [searchParams, router, locale])

  // Show loading while redirecting
  return <LoadingLayout message={t('redirecting')} fullScreen />
}