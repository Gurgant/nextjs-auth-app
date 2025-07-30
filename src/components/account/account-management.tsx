'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { updateUserProfile, deleteUserAccount, type ActionResult } from '@/lib/actions/auth'

interface AccountManagementProps {
  user: {
    id?: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
  locale: string
}

export function AccountManagement({ user, locale }: AccountManagementProps) {
  const t = useTranslations('Account')
  const tCommon = useTranslations('Common')
  const router = useRouter()

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [profileResult, setProfileResult] = useState<ActionResult | null>(null)
  const [deleteResult, setDeleteResult] = useState<ActionResult | null>(null)
  const [emailConfirmation, setEmailConfirmation] = useState('')

  const handleProfileUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUpdatingProfile(true)
    setProfileResult(null)

    const formData = new FormData(e.currentTarget)
    const actionResult = await updateUserProfile(formData, user.id!)
    
    setProfileResult(actionResult)
    setIsUpdatingProfile(false)

    if (actionResult.success) {
      // Refresh the page to show updated profile
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    }
  }

  const handleAccountDeletion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsDeletingAccount(true)
    setDeleteResult(null)

    const formData = new FormData(e.currentTarget)
    const actionResult = await deleteUserAccount(formData, user.email!)
    
    setDeleteResult(actionResult)
    setIsDeletingAccount(false)

    if (actionResult.success) {
      // Sign out and redirect after successful deletion
      setTimeout(async () => {
        await signOut({ callbackUrl: `/${locale}?deleted=true` })
      }, 2000)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          {t('title')}
        </h1>
        <p className="text-gray-600 text-lg">{t('subtitle')}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
        {/* Profile Management */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('profile')}</h2>
          </div>

          <form onSubmit={handleProfileUpdate} className="space-y-6">
            {/* Current User Info */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-4">
                {user.image ? (
                  <img 
                    src={user.image} 
                    alt={user.name || 'User'} 
                    className="w-12 h-12 rounded-full ring-2 ring-blue-100"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Name Update */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                {tCommon('name')}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name || ''}
                required
                className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                placeholder="Your full name"
              />
              {profileResult?.errors?.name && (
                <p className="mt-1 text-sm text-red-600">{profileResult.errors.name}</p>
              )}
            </div>

            {/* Success/Error Messages */}
            {profileResult?.message && (
              <div className={`rounded-xl p-4 ${
                profileResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {profileResult.success ? (
                    <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm font-medium ${
                    profileResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {profileResult.message}
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isUpdatingProfile ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                t('updateProfile')
              )}
            </button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-red-200/50">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-900">{t('dangerZone')}</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('accountDeletion')}</h3>
              <p className="text-gray-600 text-sm mb-4">
                {t('deleteAccountWarning')}
              </p>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex justify-center items-center py-3 px-4 border border-red-200 rounded-xl shadow-sm text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t('deleteAccount')}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-red-400 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-red-800 mb-1">{t('confirmDeletion')}</h4>
                      <p className="text-sm text-red-700">{t('confirmDeletionText')}</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleAccountDeletion} className="space-y-4">
                  <div>
                    <label htmlFor="confirmEmail" className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('typeEmailToConfirm', { email: user.email })}
                    </label>
                    <input
                      id="confirmEmail"
                      name="confirmEmail"
                      type="email"
                      value={emailConfirmation}
                      onChange={(e) => setEmailConfirmation(e.target.value)}
                      required
                      className="block w-full px-4 py-3 border border-red-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 bg-red-50 focus:bg-white"
                      placeholder={user.email || ''}
                    />
                  </div>

                  {/* Success/Error Messages */}
                  {deleteResult?.message && (
                    <div className={`rounded-xl p-4 ${
                      deleteResult.success 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      <div className="flex items-center">
                        {deleteResult.success ? (
                          <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        <p className={`text-sm font-medium ${
                          deleteResult.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {deleteResult.message}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false)
                        setEmailConfirmation('')
                        setDeleteResult(null)
                      }}
                      className="flex-1 py-3 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
                    >
                      {tCommon('cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isDeletingAccount || emailConfirmation !== user.email}
                      className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isDeletingAccount ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Deleting...
                        </>
                      ) : (
                        t('deleteAccount')
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}