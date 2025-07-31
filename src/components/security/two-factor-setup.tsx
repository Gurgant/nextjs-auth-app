'use client'

import { useState, useEffect, useRef } from 'react'
import { setupTwoFactorAuth, enableTwoFactorAuth, type ActionResult } from '@/lib/actions/advanced-auth'
import Image from 'next/image'

interface TwoFactorSetupProps {
  user: {
    id?: string
    email?: string | null
  }
  onSetupComplete?: () => void
  onCancel?: () => void
}

export function TwoFactorSetup({ user, onSetupComplete, onCancel }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup')
  const [isLoading, setIsLoading] = useState(false)
  const [setupData, setSetupData] = useState<{
    qrCodeUrl: string
    backupCodes: string[]
    secret: string // This is the encrypted secret from the backend
    manualEntrySecret: string // This is the plain secret for manual entry/QR code
  } | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [backupCodesDownloaded, setBackupCodesDownloaded] = useState(false)
  
  const formRef = useRef<HTMLFormElement>(null)

  // Initialize 2FA setup
  const handleSetup = async () => {
    if (!user.id) return
    
    setIsLoading(true)
    setResult(null)
    
    try {
      const setupResult = await setupTwoFactorAuth(user.id)
      
      if (setupResult.success && setupResult.data) {
        setSetupData(setupResult.data)
        setStep('verify')
      } else {
        setResult(setupResult)
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to setup 2FA. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Verify and enable 2FA
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user.id || !setupData) return
    
    setIsLoading(true)
    setResult(null)
    
    // CRITICAL DEBUG: Trace the encrypted secret before sending
    console.log('🚀 Frontend Debug - Setup data exists:', !!setupData)
    console.log('🚀 Frontend Debug - Encrypted secret length:', setupData.secret?.length)
    console.log('🚀 Frontend Debug - Encrypted secret (first 50 chars):', setupData.secret?.substring(0, 50) + '...')
    console.log('🚀 Frontend Debug - Manual entry secret length:', setupData.manualEntrySecret?.length)
    console.log('🚀 Frontend Debug - Verification code:', verificationCode)
    
    const formData = new FormData()
    formData.append('encryptedSecret', setupData.secret) // Use correct property name
    formData.append('verificationCode', verificationCode)
    
    // Verify FormData contains the secret
    const formDataEncryptedSecret = formData.get('encryptedSecret')
    console.log('🚀 Frontend Debug - FormData encrypted secret type:', typeof formDataEncryptedSecret)
    console.log('🚀 Frontend Debug - FormData encrypted secret length:', formDataEncryptedSecret?.toString().length)
    console.log('🚀 Frontend Debug - FormData encrypted secret (first 50 chars):', formDataEncryptedSecret?.toString().substring(0, 50) + '...')
    
    try {
      const enableResult = await enableTwoFactorAuth(formData, user.id)
      
      if (enableResult.success) {
        setSetupData(prev => prev ? {
          ...prev,
          backupCodes: enableResult.data?.backupCodes || []
        } : null)
        setStep('complete')
      }
      
      setResult(enableResult)
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to verify 2FA code. Please try again.'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Test current secret with diagnostic endpoint
  const testSecret = async () => {
    if (!setupData?.manualEntrySecret || !verificationCode) return
    
    try {
      const response = await fetch('/api/debug/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: setupData.manualEntrySecret,
          code: verificationCode
        })
      })
      
      const diagnostic = await response.json()
      console.log('🔬 TOTP Diagnostic Result:', diagnostic)
      
      setResult({
        success: diagnostic.isValid,
        message: diagnostic.isValid 
          ? `✅ Code is valid! Expected: ${diagnostic.expectedCode}, Got: ${diagnostic.userCode}` 
          : `❌ Code mismatch. Expected: ${diagnostic.expectedCode}, Got: ${diagnostic.userCode}. Check your authenticator app has the correct secret: ${setupData.manualEntrySecret}`
      })
    } catch (error) {
      console.error('Diagnostic test failed:', error)
      setResult({
        success: false,
        message: 'Failed to test code. Please try the verification directly.'
      })
    }
  }

  // Download backup codes
  const downloadBackupCodes = () => {
    if (!setupData?.backupCodes) return
    
    const content = `Auth App - Two-Factor Authentication Backup Codes
    
Generated: ${new Date().toLocaleString()}
Email: ${user.email}

IMPORTANT: Store these codes in a safe place. Each code can only be used once.

${setupData.backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

Instructions:
- Use these codes if you lose access to your authenticator app
- Each code can only be used once
- Generate new codes if you use more than half of them
- Keep these codes secure and private`

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auth-app-backup-codes-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    setBackupCodesDownloaded(true)
  }

  // Complete setup
  const handleComplete = () => {
    onSetupComplete?.()
  }

  if (step === 'setup') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-white/20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Setup Two-Factor Authentication</h2>
          <p className="text-gray-600">Add an extra layer of security to your account</p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">What you'll need:</h3>
            <ul className="space-y-2 text-blue-800">
              <li className="flex items-center">
                <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                An authenticator app (Google Authenticator, Authy, etc.)
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Your phone or tablet to scan the QR code
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                A safe place to store backup codes
              </li>
            </ul>
          </div>

          {result && !result.success && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-700">{result.message}</p>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={handleSetup}
              disabled={isLoading}
              className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Setting up...
                </>
              ) : (
                'Start Setup'
              )}
            </button>
            
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex-1 flex justify-center py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'verify' && setupData) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-white/20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan QR Code</h2>
          <p className="text-gray-600">Use your authenticator app to scan this QR code</p>
        </div>

        <div className="space-y-8">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl border-2 border-gray-200">
              <Image
                src={setupData.qrCodeUrl}
                alt="2FA QR Code"
                width={256}
                height={256}
                className="rounded-lg"
              />
            </div>
          </div>

          {/* Manual Entry */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Can't scan? Enter this code manually:</p>
            <div className="bg-white border rounded-lg p-3">
              <code className="text-sm text-gray-800 break-all font-mono tracking-widest">{setupData.manualEntrySecret}</code>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
              <p className="text-xs text-yellow-800">
                <strong>⚠️ IMPORTANT:</strong> If you've already added this account to your authenticator app, 
                delete the old entry first, then scan this new QR code or enter this new secret.
              </p>
            </div>
          </div>

          {/* Verification */}
          <form ref={formRef} onSubmit={handleVerify} className="space-y-6">
            <div>
              <label htmlFor="verificationCode" className="block text-sm font-semibold text-gray-700 mb-2">
                Enter verification code from your app:
              </label>
              <input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
                maxLength={6}
                required
              />
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>💡 TIP:</strong> Make sure you're using the code from the <em>newest</em> entry in your authenticator app 
                  with the secret: <code className="font-mono">{setupData.manualEntrySecret}</code>
                </p>
              </div>
            </div>

            {result && (
              <div className={`rounded-xl p-4 ${
                result.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {result.success ? (
                    <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm font-medium ${
                    result.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {result.message}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Test Button */}
              <button
                type="button"
                onClick={testSecret}
                disabled={verificationCode.length !== 6}
                className="w-full flex justify-center items-center py-2 px-4 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                🔍 Test Code First
              </button>
              
              <div className="flex space-x-4">
              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : (
                  'Verify & Enable'
                )}
              </button>
              
              <button
                type="button"
                onClick={() => setStep('setup')}
                className="flex-1 flex justify-center py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                Back
              </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'complete' && setupData) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-white/20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">2FA Enabled Successfully!</h2>
          <p className="text-gray-600">Your account is now protected with two-factor authentication</p>
        </div>

        <div className="space-y-6">
          {/* Backup Codes */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-yellow-900">🔑 Backup Codes</h3>
              <button
                onClick={() => setShowBackupCodes(!showBackupCodes)}
                className="text-sm text-yellow-700 hover:text-yellow-800 font-medium"
              >
                {showBackupCodes ? 'Hide' : 'Show'} Codes
              </button>
            </div>
            
            <p className="text-yellow-800 mb-4 text-sm">
              Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
            </p>

            {showBackupCodes && (
              <div className="bg-white rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {setupData.backupCodes.map((code, index) => (
                    <div key={index} className="text-gray-800 p-2 bg-gray-50 rounded text-center">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={downloadBackupCodes}
              className="w-full flex justify-center items-center py-2 px-4 border border-yellow-300 rounded-lg text-sm font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-all duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Backup Codes
            </button>
          </div>

          {/* Completion */}
          <div className="flex space-x-4">
            <button
              onClick={handleComplete}
              disabled={!backupCodesDownloaded}
              className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {backupCodesDownloaded ? 'Complete Setup' : 'Download Codes First'}
            </button>
          </div>

          {!backupCodesDownloaded && (
            <p className="text-sm text-center text-gray-500">
              Please download your backup codes before completing the setup
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}