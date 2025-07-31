'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  useEffect(() => {
    const error = searchParams.get('error')
    
    if (error) {
      // If there's an error parameter, redirect to our error page
      console.log('🚨 SignIn page: Redirecting error to error page:', error)
      router.replace(`/en/auth/error?error=${error}`)
      return
    }
    
    // If no error, redirect to the main sign-in page (home)
    router.replace('/en')
  }, [searchParams, router])

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}