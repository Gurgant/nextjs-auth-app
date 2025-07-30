'use client'

import { useTranslations } from 'next-intl'
import { SignInButton } from '@/components/auth/sign-in-button'

export function DashboardContent({ user }: { user: any }) {
  const t = useTranslations('Dashboard')

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
          <p className="text-gray-600">{t('message')}</p>
        </div>
        
        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center gap-4">
            {user.image && (
              <img 
                src={user.image} 
                alt={user.name || 'User'} 
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <p className="font-semibold">{t('welcome', { name: user.name || 'User' })}</p>
              <p className="text-sm text-gray-600">{t('email', { email: user.email })}</p>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-6">
          <SignInButton />
        </div>
      </div>
    </div>
  )
}