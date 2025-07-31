'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Mail, Key, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('Auth')
  
  const error = searchParams.get('error')
  
  // Error messages mapping
  const getErrorInfo = (errorCode: string | null) => {
    switch (errorCode) {
      case 'OAuthAccountNotLinked':
        return {
          title: t('error.accountAlreadyExists'),
          description: t('error.accountAlreadyExistsDescription'),
          details: t('error.accountAlreadyExistsDetails'),
          icon: <Mail className="h-6 w-6 text-orange-500" />,
          color: 'orange'
        }
      case 'AccessDenied':
        return {
          title: t('error.accessDenied'),
          description: t('error.accessDeniedDescription'),
          details: t('error.accessDeniedDetails'),
          icon: <Key className="h-6 w-6 text-red-500" />,
          color: 'red'
        }
      case 'Configuration':
        return {
          title: t('error.configurationError'),
          description: t('error.configurationErrorDescription'),
          details: t('error.configurationErrorDetails'),
          icon: <AlertCircle className="h-6 w-6 text-red-500" />,
          color: 'red'
        }
      case 'OAuthCallbackError':
        return {
          title: t('error.oauthCallbackError'),
          description: t('error.oauthCallbackErrorDescription'),
          details: t('error.oauthCallbackErrorDetails'),
          icon: <AlertCircle className="h-6 w-6 text-orange-500" />,
          color: 'orange'
        }
      default:
        return {
          title: t('error.authenticationError'),
          description: t('error.authenticationErrorDescription'),
          details: t('error.authenticationErrorDetails'),
          icon: <HelpCircle className="h-6 w-6 text-gray-500" />,
          color: 'gray'
        }
    }
  }

  const errorInfo = getErrorInfo(error)

  const handleSignInWithEmail = () => {
    // Redirect to home page where sign-in options are available
    router.push('/en')
  }

  const handleTryDifferentAccount = () => {
    // Clear any cached OAuth state and redirect to home page
    router.push('/en')
  }

  const handleGoBack = () => {
    router.push('/en')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            {errorInfo.icon}
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('error.title')}
          </h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {errorInfo.icon}
              {errorInfo.title}
            </CardTitle>
            <CardDescription>
              {errorInfo.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorInfo.details}
              </AlertDescription>
            </Alert>

            {error === 'OAuthAccountNotLinked' && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">{t('error.howToResolve')}</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                    <li>{t('error.signInWithEmailFirst')}</li>
                    <li>{t('error.goToAccountSettings')}</li>
                    <li>{t('error.linkGoogleAccount')}</li>
                  </ol>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <Button 
                    onClick={handleSignInWithEmail}
                    className="w-full"
                    variant="default"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {t('error.tryEmailSignIn')}
                  </Button>
                  
                  <Button 
                    onClick={handleTryDifferentAccount}
                    variant="outline"
                    className="w-full"
                  >
                    {t('error.tryDifferentAccount')}
                  </Button>
                </div>
              </div>
            )}

            {error !== 'OAuthAccountNotLinked' && (
              <div className="grid grid-cols-1 gap-3">
                <Button 
                  onClick={handleSignInWithEmail}
                  className="w-full"
                  variant="default"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {t('error.tryEmailSignIn')}
                </Button>
                
                <Button 
                  onClick={handleTryDifferentAccount}
                  variant="outline"
                  className="w-full"
                >
                  {t('error.tryAgain')}
                </Button>
              </div>
            )}

            <div className="pt-4 border-t">
              <Button 
                onClick={handleGoBack}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('error.goBack')}
              </Button>
            </div>

            {/* Debug info for development */}
            {process.env.NODE_ENV === 'development' && error && (
              <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600">
                <strong>Debug Info:</strong> Error code: {error}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            {t('error.needHelp')}{' '}
            <Link href="/support" className="font-medium text-indigo-600 hover:text-indigo-500">
              {t('error.contactSupport')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}