import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { TwoFactorVerification } from '@/components/auth/two-factor-verification'
import { getEnhancedUserAccountInfo } from '@/lib/actions/advanced-auth'

interface TwoFactorPageProps {
  params: {
    locale: string
  }
  searchParams: {
    userId?: string
    email?: string
    callbackUrl?: string
    error?: string
  }
}

export default async function TwoFactorPage({ params, searchParams }: TwoFactorPageProps) {
  const { locale } = params
  const { userId, email, callbackUrl, error } = searchParams

  // Check if user is already fully authenticated
  const session = await getServerSession(authOptions)
  if (session?.user?.id && !userId) {
    // User is already signed in, redirect to dashboard
    redirect(callbackUrl || `/${locale}`)
  }

  // Validate required parameters
  if (!userId || !email) {
    console.error('2FA page: Missing required parameters (userId or email)')
    redirect(`/${locale}/auth/signin?error=missing_params`)
  }

  // Verify user exists and has 2FA enabled
  try {
    const accountInfo = await getEnhancedUserAccountInfo(userId)
    
    if (!accountInfo.success || !accountInfo.data?.twoFactorEnabled) {
      console.error('2FA page: User not found or 2FA not enabled')
      redirect(`/${locale}/auth/signin?error=2fa_not_enabled`)
    }

    // Check if user email matches
    if (accountInfo.data.email !== email) {
      console.error('2FA page: Email mismatch')
      redirect(`/${locale}/auth/signin?error=invalid_session`)
    }
  } catch (error) {
    console.error('2FA page: Error verifying user:', error)
    redirect(`/${locale}/auth/signin?error=verification_failed`)
  }

  return (
    <div className="min-h-screen">
      {/* Error Message */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-red-700">
                {error === '2fa_failed' && 'Too many failed attempts. Please sign in again.'}
                {error === 'invalid_code' && 'Invalid verification code. Please try again.'}
                {error === 'expired' && 'Session expired. Please sign in again.'}
                {!['2fa_failed', 'invalid_code', 'expired'].includes(error) && 'Authentication error. Please try again.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <TwoFactorVerification
        userId={userId}
        email={email}
        callbackUrl={callbackUrl || `/${locale}`}
      />
    </div>
  )
}

// Generate metadata for the page
export async function generateMetadata({ params }: { params: { locale: string } }) {
  return {
    title: 'Two-Factor Authentication - Auth App',
    description: 'Complete your sign-in with two-factor authentication',
    robots: 'noindex, nofollow', // Don't index auth pages
  }
}