'use client'

import { useTranslations } from 'next-intl'
import { SignInButton } from '@/components/auth/sign-in-button'

export default function HomePage() {
  const t = useTranslations('Home')

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-lg text-gray-600">{t('subtitle')}</p>
        </div>
        <SignInButton />
      </div>
    </div>
  )
}