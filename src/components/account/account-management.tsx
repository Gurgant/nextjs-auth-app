'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { updateUserProfile, deleteUserAccount, addPasswordToGoogleUser, changeUserPassword, getUserAccountInfo, type ActionResult } from '@/lib/actions/auth'
import { 
  getEnhancedUserAccountInfo,
  sendEmailVerification,
  initiateAccountLinking,
  setupTwoFactorAuth,
  enableTwoFactorAuth,
  disableTwoFactorAuth
} from '@/lib/actions/advanced-auth'
import { TwoFactorSetup } from '@/components/security/two-factor-setup'

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

  // Existing state
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [profileResult, setProfileResult] = useState<ActionResult | null>(null)
  const [deleteResult, setDeleteResult] = useState<ActionResult | null>(null)
  const [emailConfirmation, setEmailConfirmation] = useState('')

  // Enhanced account management state
  const [accountInfo, setAccountInfo] = useState<any>(null)
  const [isLoadingAccountInfo, setIsLoadingAccountInfo] = useState(true)
  const [isAddingPassword, setIsAddingPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordResult, setPasswordResult] = useState<ActionResult | null>(null)
  const [changePasswordResult, setChangePasswordResult] = useState<ActionResult | null>(null)
  
  // Advanced authentication state
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false)
  const [isLinkingAccount, setIsLinkingAccount] = useState(false)
  const [isSendingVerification, setIsSendingVerification] = useState(false)
  const [linkingResult, setLinkingResult] = useState<ActionResult | null>(null)
  const [verificationResult, setVerificationResult] = useState<ActionResult | null>(null)
  
  // Form refs for reliable form management
  const addPasswordFormRef = useRef<HTMLFormElement>(null)
  const changePasswordFormRef = useRef<HTMLFormElement>(null)
  const profileFormRef = useRef<HTMLFormElement>(null)
  
  // Utility function for safe form reset with enhanced error handling
  const safeFormReset = useCallback((formRef: React.RefObject<HTMLFormElement>, formName: string) => {
    try {
      if (formRef.current && typeof formRef.current.reset === 'function') {
        formRef.current.reset()
        console.log(`✅ Successfully reset ${formName} form`)
      } else {
        console.warn(`⚠️ Form reference not available for ${formName}`)
      }
    } catch (error) {
      console.error(`❌ Failed to reset ${formName} form:`, error)
    }
  }, [])
  
  // Enhanced error handler for consistent error management
  const handleFormError = useCallback((error: unknown, action: string) => {
    console.error(`❌ Error during ${action}:`, error)
    // Could be extended to show user-friendly error notifications
  }, [])

  // Load enhanced account information on component mount
  useEffect(() => {
    const loadAccountInfo = async () => {
      if (!user.id) {
        console.warn('⚠️ User ID not available for account info loading')
        return
      }
      
      setIsLoadingAccountInfo(true)
      try {
        const result = await getEnhancedUserAccountInfo(user.id)
        if (result.success) {
          setAccountInfo(result.data)
          console.log('✅ Enhanced account info loaded successfully')
        } else {
          handleFormError(new Error(result.message || 'Failed to load account info'), 'account info loading')
          // Set fallback account info to prevent UI breaks
          setAccountInfo({
            hasGoogleAccount: false,
            hasPassword: false,
            hasEmailAccount: false,
            emailVerified: null,
            twoFactorEnabled: false
          })
        }
      } catch (error) {
        handleFormError(error, 'account info loading')
        // Set fallback account info to prevent UI breaks
        setAccountInfo({
          hasGoogleAccount: false,
          hasPassword: false,
          hasEmailAccount: false,
          emailVerified: null,
          twoFactorEnabled: false
        })
      } finally {
        setIsLoadingAccountInfo(false)
      }
    }

    loadAccountInfo()
  }, [user.id, handleFormError])

  const handleProfileUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUpdatingProfile(true)
    setProfileResult(null)

    try {
      const formData = new FormData(e.currentTarget)
      const actionResult = await updateUserProfile(formData, user.id!)
      
      setProfileResult(actionResult)
      
      if (actionResult.success) {
        // Refresh the page to show updated profile
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      }
    } catch (error) {
      handleFormError(error, 'profile update')
      setProfileResult({
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      })
    } finally {
      setIsUpdatingProfile(false)
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

  // Add password for Google users
  const handleAddPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsAddingPassword(true)
    setPasswordResult(null)

    try {
      const formData = new FormData(e.currentTarget)
      const actionResult = await addPasswordToGoogleUser(formData, user.id!)
      
      setPasswordResult(actionResult)
      
      if (actionResult.success) {
        // Refresh account info to show updated password status
        setTimeout(async () => {
          try {
            const info = await getUserAccountInfo(user.id!)
            setAccountInfo(info)
            // Clear form using ref-based utility
            safeFormReset(addPasswordFormRef, 'add password')
          } catch (error) {
            handleFormError(error, 'account info refresh')
          }
        }, 1500)
      }
    } catch (error) {
      handleFormError(error, 'password addition')
      setPasswordResult({
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      })
    } finally {
      setIsAddingPassword(false)
    }
  }

  // Change existing password
  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsChangingPassword(true)
    setChangePasswordResult(null)

    try {
      const formData = new FormData(e.currentTarget)
      const actionResult = await changeUserPassword(formData, user.id!)
      
      setChangePasswordResult(actionResult)
      
      if (actionResult.success) {
        // Clear form on success using ref-based utility
        setTimeout(() => {
          safeFormReset(changePasswordFormRef, 'change password')
        }, 1500)
      }
    } catch (error) {
      handleFormError(error, 'password change')
      setChangePasswordResult({
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Send email verification
  const handleSendEmailVerification = async () => {
    if (!user.email) return
    
    setIsSendingVerification(true)
    setVerificationResult(null)
    
    try {
      const result = await sendEmailVerification(user.email, locale)
      setVerificationResult(result)
      
      if (result.success) {
        // Refresh account info after sending verification
        setTimeout(async () => {
          const updatedInfo = await getEnhancedUserAccountInfo(user.id!)
          if (updatedInfo.success) {
            setAccountInfo(updatedInfo.data)
          }
        }, 1000)
      }
    } catch (error) {
      handleFormError(error, 'email verification sending')
      setVerificationResult({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      })
    } finally {
      setIsSendingVerification(false)
    }
  }

  // Handle account linking
  const handleAccountLinking = async (linkType: 'google' | 'email') => {
    if (!user.id) return
    
    setIsLinkingAccount(true)
    setLinkingResult(null)
    
    try {
      const result = await initiateAccountLinking(user.id, linkType, locale)
      setLinkingResult(result)
      
      if (result.success) {
        // Show success message and refresh account info after delay
        setTimeout(async () => {
          const updatedInfo = await getEnhancedUserAccountInfo(user.id!)
          if (updatedInfo.success) {
            setAccountInfo(updatedInfo.data)
          }
        }, 2000)
      }
    } catch (error) {
      handleFormError(error, 'account linking')
      setLinkingResult({
        success: false,
        message: 'Failed to initiate account linking. Please try again.'
      })
    } finally {
      setIsLinkingAccount(false)
    }
  }

  // Handle 2FA setup completion
  const handleTwoFactorSetupComplete = async () => {
    setShowTwoFactorSetup(false)
    
    // Refresh account info to show updated 2FA status
    const updatedInfo = await getEnhancedUserAccountInfo(user.id!)
    if (updatedInfo.success) {
      setAccountInfo(updatedInfo.data)
    }
  }

  // Handle 2FA disable
  const handleDisableTwoFactor = async () => {
    if (!user.id) return
    
    const confirmed = window.confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')
    if (!confirmed) return
    
    try {
      const result = await disableTwoFactorAuth(user.id)
      
      if (result.success) {
        // Refresh account info
        const updatedInfo = await getEnhancedUserAccountInfo(user.id)
        if (updatedInfo.success) {
          setAccountInfo(updatedInfo.data)
        }
      }
    } catch (error) {
      handleFormError(error, '2FA disable')
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

      {/* Account Providers Section */}
      <div className="mb-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('authenticationMethods')}</h2>
          </div>

          {isLoadingAccountInfo ? (
            <div className="space-y-4">
              <div className="animate-pulse bg-gray-200 h-16 rounded-xl"></div>
              <div className="animate-pulse bg-gray-200 h-16 rounded-xl"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google Account Status */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <svg className="w-8 h-8" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900">{t('googleAccount')}</p>
                    <p className="text-sm text-gray-600">
                      {accountInfo?.hasGoogleAccount ? (
                        <>
                          {t('linkedOn', { date: new Date(accountInfo.createdAt).toLocaleDateString() })}
                          {accountInfo?.primaryAuthMethod === 'google' && (
                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              {t('primaryMethod')}
                            </span>
                          )}
                        </>
                      ) : (
                        t('notLinked')
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {accountInfo?.hasGoogleAccount ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              </div>

              {/* Email/Password Status */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t('emailPassword')}</p>
                    <p className="text-sm text-gray-600">
                      {accountInfo?.hasPassword ? (
                        <>
                          {t('linkedOn', { date: new Date(accountInfo.passwordSetAt || accountInfo.createdAt).toLocaleDateString() })}
                          {accountInfo?.primaryAuthMethod === 'email' && (
                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              {t('primaryMethod')}
                            </span>
                          )}
                          {accountInfo?.hasGoogleAccount && (
                            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                              {t('backupMethod')}
                            </span>
                          )}
                        </>
                      ) : (
                        t('notLinked')
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {accountInfo?.hasPassword ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
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

          <form ref={profileFormRef} onSubmit={handleProfileUpdate} className="space-y-6">
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

        {/* Password Management */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('passwordManagement')}</h2>
          </div>

          {isLoadingAccountInfo ? (
            <div className="animate-pulse bg-gray-200 h-32 rounded-xl"></div>
          ) : (
            <div className="space-y-6">
              {/* Set Password for Google Users */}
              {accountInfo?.hasGoogleAccount && !accountInfo?.hasPassword && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('setPassword')}</h3>
                    <p className="text-gray-600 text-sm">{t('addPasswordDescription')}</p>
                  </div>

                  <form ref={addPasswordFormRef} onSubmit={handleAddPassword} className="space-y-4">
                    <div>
                      <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                        {tCommon('password')}
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        placeholder="Enter your new password"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {tCommon('confirmPassword')}
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        placeholder="Confirm your new password"
                      />
                    </div>

                    {/* Success/Error Messages */}
                    {passwordResult?.message && (
                      <div className={`rounded-xl p-4 ${
                        passwordResult.success 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-center">
                          {passwordResult.success ? (
                            <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <p className={`text-sm font-medium ${
                            passwordResult.success ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {passwordResult.message}
                          </p>
                        </div>
                        {passwordResult.errors && (
                          <div className="mt-2">
                            {Object.entries(passwordResult.errors).map(([field, error]) => (
                              <p key={field} className="text-sm text-red-600">
                                {error}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isAddingPassword}
                      className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isAddingPassword ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Adding...
                        </>
                      ) : (
                        t('setPassword')
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Change Password for Users with Existing Password */}
              {accountInfo?.hasPassword && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('changePassword')}</h3>
                    <p className="text-gray-600 text-sm">{t('changePasswordDescription')}</p>
                  </div>

                  <form ref={changePasswordFormRef} onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('currentPassword')}
                      </label>
                      <input
                        id="currentPassword"
                        name="currentPassword"
                        type="password"
                        required
                        className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        placeholder="Enter your current password"
                      />
                    </div>

                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('newPassword')}
                      </label>
                      <input
                        id="newPassword"
                        name="newPassword"
                        type="password"
                        required
                        className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        placeholder="Enter your new password"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('confirmNewPassword')}
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        placeholder="Confirm your new password"
                      />
                    </div>

                    {/* Success/Error Messages */}
                    {changePasswordResult?.message && (
                      <div className={`rounded-xl p-4 ${
                        changePasswordResult.success 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-center">
                          {changePasswordResult.success ? (
                            <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <p className={`text-sm font-medium ${
                            changePasswordResult.success ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {changePasswordResult.message}
                          </p>
                        </div>
                        {changePasswordResult.errors && (
                          <div className="mt-2">
                            {Object.entries(changePasswordResult.errors).map(([field, error]) => (
                              <p key={field} className="text-sm text-red-600">
                                {error}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isChangingPassword ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Changing...
                        </>
                      ) : (
                        t('changePassword')
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* No Password Options Available */}
              {!accountInfo?.hasGoogleAccount && !accountInfo?.hasPassword && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="text-gray-600">No password management options available</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Verification Status */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Email Verification</h2>
          </div>

          <div className="space-y-4">
            {user.email && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full ${
                      accountInfo?.emailVerified 
                        ? 'bg-green-500' 
                        : 'bg-yellow-500'
                    }`}></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.email}</p>
                    <p className="text-xs text-gray-500">Primary email address</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {accountInfo?.emailVerified ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Verified
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Unverified
                      </span>
                      <button
                        onClick={handleSendEmailVerification}
                        disabled={isSendingVerification}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                      >
                        {isSendingVerification ? 'Sending...' : 'Verify'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Email verification result */}
            {verificationResult && (
              <div className={`rounded-xl p-4 ${
                verificationResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {verificationResult.success ? (
                    <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm font-medium ${
                    verificationResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {verificationResult.message}
                  </p>
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-600">
              Email verification adds an extra layer of security to your account and enables important notifications.
            </p>
          </div>
        </div>

        {/* Account Linking */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Account Linking</h2>
          </div>

          <div className="space-y-6">
            <p className="text-gray-600">
              Link multiple authentication methods to your account for enhanced security and convenience.
            </p>

            {/* Google Account Linking */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Google Account</p>
                    <p className="text-xs text-gray-500">Sign in with Google</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {accountInfo?.hasGoogleAccount ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Linked
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Not Linked
                      </span>
                      <button 
                        onClick={() => handleAccountLinking('google')}
                        disabled={isLinkingAccount}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                      >
                        {isLinkingAccount ? 'Linking...' : 'Link Account'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Email Account Linking */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email & Password</p>
                    <p className="text-xs text-gray-500">Traditional login credentials</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {accountInfo?.hasEmailAccount ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Linked
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Not Linked
                      </span>
                      <button 
                        onClick={() => handleAccountLinking('email')}
                        disabled={isLinkingAccount}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                      >
                        {isLinkingAccount ? 'Linking...' : 'Link Account'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Account linking result */}
            {linkingResult && (
              <div className={`rounded-xl p-4 ${
                linkingResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {linkingResult.success ? (
                    <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm font-medium ${
                    linkingResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {linkingResult.message}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Two-Factor Authentication</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900">Authenticator App</p>
                <p className="text-xs text-gray-500">
                  Add an extra layer of security with time-based codes
                </p>
                {accountInfo?.twoFactorEnabled && accountInfo?.backupCodesCount !== undefined && (
                  <p className="text-xs text-green-600 mt-1">
                    {accountInfo.backupCodesCount} backup codes available
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-3">
                {accountInfo?.twoFactorEnabled ? (
                  <>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Enabled
                    </span>
                    <button 
                      onClick={handleDisableTwoFactor}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Disable 2FA
                    </button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Disabled
                    </span>
                    <button 
                      onClick={() => setShowTwoFactorSetup(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Enable 2FA
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-blue-400 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-1">Enhanced Security</h4>
                  <p className="text-sm text-blue-700">
                    Two-factor authentication significantly increases your account security by requiring a second verification step during login.
                  </p>
                </div>
              </div>
            </div>
          </div>
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

      {/* Two-Factor Authentication Setup Modal */}
      {showTwoFactorSetup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <TwoFactorSetup
              user={user}
              onSetupComplete={handleTwoFactorSetupComplete}
              onCancel={() => setShowTwoFactorSetup(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}