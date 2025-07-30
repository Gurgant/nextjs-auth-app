'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SignInButton } from '@/components/auth/sign-in-button'
import { CredentialsForm } from '@/components/auth/credentials-form'
import { useSession } from 'next-auth/react'

export default function HomePage() {
  const t = useTranslations('Home')
  const tAuth = useTranslations('Auth')
  const { data: session } = useSession()
  const [showCredentials, setShowCredentials] = useState(false)

  if (session) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">{t('welcomeBack', { name: session.user?.name || session.user?.email })}</h2>
          <SignInButton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-lg text-gray-600">{t('subtitle')}</p>
        </div>
        
        {showCredentials ? (
          <div className="space-y-4">
            <CredentialsForm />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">{tAuth('or')}</span>
              </div>
            </div>
            <button
              onClick={() => setShowCredentials(false)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {tAuth('signInWithGoogleInstead')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <SignInButton />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">{tAuth('or')}</span>
              </div>
            </div>
            <button
              onClick={() => setShowCredentials(true)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {tAuth('signInWithEmail')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}