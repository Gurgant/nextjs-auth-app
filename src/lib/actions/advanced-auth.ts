'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { 
  generateSecureToken, 
  encrypt, 
  decrypt,
  logSecurityEvent, 
  getClientIP,
  type SecurityEventData 
} from '@/lib/security'
import { 
  sendVerificationEmail, 
  sendAccountLinkConfirmation,
  sendSecurityAlert 
} from '@/lib/email'
import { 
  setupTwoFactor, 
  validateTOTPCode, 
  validateBackupCode,
  encryptBackupCodes,
  generateNewBackupCodes,
  isValidTOTPFormat,
  isValidBackupCodeFormat,
  type TwoFactorSetup 
} from '@/lib/two-factor'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export interface ActionResult {
  success: boolean
  message?: string
  errors?: Record<string, string>
  data?: any
}

// Email Verification Actions
const emailVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function sendEmailVerification(userEmail: string, locale: string = 'en'): Promise<ActionResult> {
  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true, email: true, emailVerified: true }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    if (user.emailVerified) {
      return {
        success: false,
        message: 'Email is already verified'
      }
    }

    // Generate verification token
    const token = generateSecureToken(32)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

    // Create verification token in database
    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        email: user.email,
        expires: expiresAt
      }
    })

    // Send verification email
    const emailSent = await sendVerificationEmail(
      user.email,
      user.name || '',
      token,
      locale
    )

    if (!emailSent) {
      return {
        success: false,
        message: 'Failed to send verification email'
      }
    }

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId: user.id,
      eventType: 'email_verified',
      details: 'Email verification token sent',
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: 'Verification email sent successfully'
    }

  } catch (error) {
    console.error('Send email verification error:', error)
    return {
      success: false,
      message: 'Failed to send verification email'
    }
  }
}

export async function verifyEmailToken(token: string): Promise<ActionResult> {
  try {
    // Find verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!verificationToken) {
      return {
        success: false,
        message: 'Invalid verification token'
      }
    }

    if (verificationToken.used) {
      return {
        success: false,
        message: 'Verification token has already been used'
      }
    }

    if (new Date() > verificationToken.expires) {
      return {
        success: false,
        message: 'Verification token has expired'
      }
    }

    // Mark email as verified and token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { 
          emailVerified: new Date(),
          emailVerificationRequired: false
        }
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true }
      })
    ])

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId: verificationToken.userId,
      eventType: 'email_verified',
      details: 'Email address verified successfully',
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: 'Email verified successfully'
    }

  } catch (error) {
    console.error('Verify email token error:', error)
    return {
      success: false,
      message: 'Failed to verify email'
    }
  }
}

// Account Linking Actions
export async function initiateAccountLinking(
  userId: string,
  linkType: 'google' | 'email',
  locale: string = 'en'
): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        name: true,
        hasGoogleAccount: true,
        hasEmailAccount: true
      }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    // Check if linking is already in progress
    const existingRequest = await prisma.accountLinkRequest.findFirst({
      where: {
        userId,
        requestType: `link_${linkType}`,
        completed: false,
        expires: { gt: new Date() }
      }
    })

    if (existingRequest) {
      return {
        success: false,
        message: 'Account linking request already in progress'
      }
    }

    // Generate linking token
    const token = generateSecureToken(32)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Create linking request
    await prisma.accountLinkRequest.create({
      data: {
        userId,
        requestType: `link_${linkType}`,
        token,
        expires: expiresAt,
        metadata: {
          initiatedAt: new Date().toISOString(),
          linkType
        }
      }
    })

    // Send confirmation email
    const emailSent = await sendAccountLinkConfirmation(
      user.email,
      user.name || '',
      linkType,
      token,
      locale
    )

    if (!emailSent) {
      return {
        success: false,
        message: 'Failed to send confirmation email'
      }
    }

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId,
      eventType: 'account_linked',
      details: `Account linking initiated for ${linkType}`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: 'Confirmation email sent. Please check your email to complete account linking.'
    }

  } catch (error) {
    console.error('Initiate account linking error:', error)
    return {
      success: false,
      message: 'Failed to initiate account linking'
    }
  }
}

export async function confirmAccountLinking(token: string): Promise<ActionResult> {
  try {
    const linkRequest = await prisma.accountLinkRequest.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!linkRequest) {
      return {
        success: false,
        message: 'Invalid linking token'
      }
    }

    if (linkRequest.completed) {
      return {
        success: false,
        message: 'Account linking has already been completed'
      }
    }

    if (new Date() > linkRequest.expires) {
      return {
        success: false,
        message: 'Linking token has expired'
      }
    }

    const linkType = linkRequest.requestType.replace('link_', '') as 'google' | 'email'

    // Update user account linking status
    const updateData: any = {}
    if (linkType === 'google') {
      updateData.hasGoogleAccount = true
    } else if (linkType === 'email') {
      updateData.hasEmailAccount = true
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: linkRequest.userId },
        data: updateData
      }),
      prisma.accountLinkRequest.update({
        where: { id: linkRequest.id },
        data: { completed: true }
      })
    ])

    // Send security alert
    await sendSecurityAlert(
      linkRequest.user.email,
      linkRequest.user.name || '',
      'account_linked',
      `${linkType} account has been linked to your account`
    )

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId: linkRequest.userId,
      eventType: 'account_linked',
      details: `${linkType} account linked successfully`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: 'Account linked successfully'
    }

  } catch (error) {
    console.error('Confirm account linking error:', error)
    return {
      success: false,
      message: 'Failed to confirm account linking'
    }
  }
}

// Two-Factor Authentication Actions
export async function setupTwoFactorAuth(userId: string): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    if (user.twoFactorEnabled) {
      return {
        success: false,
        message: 'Two-factor authentication is already enabled'
      }
    }

    // Setup 2FA with debugging
    console.log('🚀 2FA Setup - Starting for user:', user.email)
    
    const twoFactorSetup: TwoFactorSetup = await setupTwoFactor(user.email)
    
    console.log('🔑 2FA Setup - Generated secret length:', twoFactorSetup.secret.length)
    console.log('🔑 2FA Setup - Secret first 8 chars:', twoFactorSetup.secret.substring(0, 8) + '...')
    console.log('📱 2FA Setup - QR code URL length:', twoFactorSetup.qrCodeUrl.length)
    
    // Test the secret immediately after generation
    try {
      const { getCurrentTOTPCode, isValidSecret } = await import('@/lib/two-factor')
      const isValidFormat = isValidSecret(twoFactorSetup.secret)
      const testCode = getCurrentTOTPCode(twoFactorSetup.secret)
      
      console.log('✅ 2FA Setup - Secret format valid:', isValidFormat)
      console.log('🔢 2FA Setup - Test TOTP code generated:', testCode)
    } catch (error) {
      console.error('❌ 2FA Setup - Secret validation failed:', error)
    }
    
    // Encrypt and store the secret temporarily (will be saved when user confirms)
    const encryptedSecret = encrypt(twoFactorSetup.secret)
    console.log('🔐 2FA Setup - Secret encrypted, length:', encryptedSecret.length)
    
    // Test decryption immediately
    try {
      const decryptedTest = decrypt(encryptedSecret)
      const encryptionIntegrity = decryptedTest === twoFactorSetup.secret
      console.log('🔄 2FA Setup - Encryption/decryption integrity:', encryptionIntegrity)
      if (!encryptionIntegrity) {
        console.error('❌ 2FA Setup - Encryption integrity failed!')
        console.error('  Original:', twoFactorSetup.secret.substring(0, 10) + '...')
        console.error('  Decrypted:', decryptedTest.substring(0, 10) + '...')
      }
    } catch (error) {
      console.error('❌ 2FA Setup - Decryption test failed:', error)
    }
    
    const encryptedBackupCodes = encryptBackupCodes(twoFactorSetup.backupCodes)

    return {
      success: true,
      message: '2FA setup initiated',
      data: {
        qrCodeUrl: twoFactorSetup.qrCodeUrl,
        backupCodes: twoFactorSetup.backupCodes,
        secret: encryptedSecret, // Send encrypted secret to verify setup
        manualEntrySecret: twoFactorSetup.secret // For manual entry
      }
    }

  } catch (error) {
    console.error('Setup 2FA error:', error)
    return {
      success: false,
      message: 'Failed to setup two-factor authentication'
    }
  }
}

const enable2FASchema = z.object({
  encryptedSecret: z.string(),
  verificationCode: z.string().min(6).max(6),
})

export async function enableTwoFactorAuth(formData: FormData, userId: string): Promise<ActionResult> {
  try {
    // CRITICAL DEBUG: Trace the encrypted secret extraction
    const rawEncryptedSecret = formData.get('encryptedSecret')
    const rawVerificationCode = formData.get('verificationCode')
    
    console.log('🔍 Form Data Debug - Raw encrypted secret type:', typeof rawEncryptedSecret)
    console.log('🔍 Form Data Debug - Raw encrypted secret length:', rawEncryptedSecret?.toString().length)
    console.log('🔍 Form Data Debug - Raw encrypted secret (first 50 chars):', rawEncryptedSecret?.toString().substring(0, 50) + '...')
    console.log('🔍 Form Data Debug - Raw verification code:', rawVerificationCode)
    
    const data = {
      encryptedSecret: rawEncryptedSecret?.toString() || '',
      verificationCode: rawVerificationCode?.toString() || '',
    }
    
    console.log('🔍 Form Data Debug - Processed encrypted secret length:', data.encryptedSecret.length)
    console.log('🔍 Form Data Debug - Processed encrypted secret (first 50 chars):', data.encryptedSecret.substring(0, 50) + '...')

    const validatedData = enable2FASchema.parse(data)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, twoFactorEnabled: true }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    if (user.twoFactorEnabled) {
      return {
        success: false,
        message: '2FA is already enabled'
      }
    }

    // Decrypt secret and validate code with comprehensive debugging
    let secret: string
    try {
      console.log('🔐 2FA Debug - About to decrypt, input length:', validatedData.encryptedSecret.length)
      console.log('🔐 2FA Debug - Encrypted secret (first 50 chars):', validatedData.encryptedSecret.substring(0, 50) + '...')
      console.log('🔐 2FA Debug - Encrypted secret (last 50 chars):', '...' + validatedData.encryptedSecret.slice(-50))
      
      // Test if the encrypted secret is valid format
      if (!validatedData.encryptedSecret || validatedData.encryptedSecret.length < 10) {
        console.error('❌ 2FA Debug - Invalid encrypted secret format - too short or empty')
        return {
          success: false,
          message: 'Invalid encrypted secret format. Please try setting up 2FA again.',
          errors: { verificationCode: 'Invalid secret format' }
        }
      }
      
      secret = decrypt(validatedData.encryptedSecret)
      console.log('🔐 2FA Debug - Secret decrypted successfully')
      console.log('🔐 2FA Debug - Secret length:', secret.length)
      console.log('🔐 2FA Debug - Secret (first 8 chars):', secret.substring(0, 8) + '...')
      
      // Additional validation - check if decrypted secret is empty
      if (!secret || secret.length === 0) {
        console.error('❌ 2FA Debug - Decrypted secret is empty!')
        return {
          success: false,
          message: 'Decrypted secret is empty. Please try setting up 2FA again.',
          errors: { verificationCode: 'Empty decrypted secret' }
        }
      }
      
    } catch (error) {
      console.error('❌ 2FA Debug - Decryption failed:', error)
      console.error('❌ 2FA Debug - Error details:', error.message)
      console.error('❌ 2FA Debug - Error stack:', error.stack)
      return {
        success: false,
        message: 'Failed to decrypt 2FA secret. Please try setting up 2FA again.',
        errors: { verificationCode: 'Secret decryption failed' }
      }
    }

    // Import debugging functions
    const { getCurrentTOTPCode, isValidSecret, diagnoseTOTPIssue, checkTimeSynchronization, validateTOTPCodeWithLargeTolerance } = await import('@/lib/two-factor')
    
    // Validate secret format
    if (!isValidSecret(secret)) {
      console.error('❌ 2FA Debug - Invalid secret format')
      return {
        success: false,
        message: 'Invalid 2FA secret format. Please set up 2FA again.',
        errors: { verificationCode: 'Invalid secret format' }
      }
    }

    // Generate current expected codes for debugging
    const currentCode = getCurrentTOTPCode(secret)
    const currentTime = Math.floor(Date.now() / 1000)
    const timeStep = 30
    const currentWindow = Math.floor(currentTime / timeStep)
    
    console.log('🕐 2FA Debug - Current time:', new Date().toISOString())
    console.log('🕐 2FA Debug - Current timestamp:', currentTime)
    console.log('🕐 2FA Debug - Current time window:', currentWindow)
    console.log('🔢 2FA Debug - User code:', validatedData.verificationCode)
    console.log('🔢 2FA Debug - Expected current code:', currentCode)
    
    // Test codes for previous and next windows
    try {
      const { authenticator } = await import('otplib')
      const prevWindow = currentWindow - 1
      const nextWindow = currentWindow + 1
      const prevCode = authenticator.generate(secret, prevWindow * timeStep)
      const nextCode = authenticator.generate(secret, nextWindow * timeStep)
      
      console.log('🔢 2FA Debug - Previous window code:', prevCode)
      console.log('🔢 2FA Debug - Next window code:', nextCode)
    } catch (err) {
      console.warn('⚠️ 2FA Debug - Could not generate window codes:', err)
    }

    let isValidCode = validateTOTPCode(validatedData.verificationCode, secret)
    console.log('✅ 2FA Debug - Standard validation result:', isValidCode)
    
    // If standard validation fails, try with large tolerance
    if (!isValidCode) {
      console.log('🔄 2FA Debug - Trying large tolerance validation...')
      isValidCode = validateTOTPCodeWithLargeTolerance(validatedData.verificationCode, secret)
      console.log('✅ 2FA Debug - Large tolerance validation result:', isValidCode)
    }

    if (!isValidCode) {
      // Run comprehensive diagnosis
      const diagnosis = diagnoseTOTPIssue(secret, validatedData.verificationCode)
      const timeCheck = checkTimeSynchronization()
      
      console.log('🔬 Full TOTP Diagnosis:', JSON.stringify(diagnosis, null, 2))
      console.log('🕐 Time Synchronization Check:', JSON.stringify(timeCheck, null, 2))
      
      // Additional debugging - check if it's a timing issue
      const timeDrift = (currentTime % timeStep)
      console.log('⏰ 2FA Debug - Time drift within window:', timeDrift, 'seconds')
      console.log('⏰ 2FA Debug - Time until next code:', timeStep - timeDrift, 'seconds')
      
      // Check if any of the window validations succeeded
      const anyWindowValid = diagnosis.validationResults.some(result => result)
      console.log('🔍 2FA Debug - Any window validation succeeded:', anyWindowValid)
      
      // Build detailed error message
      let detailedMessage = `Invalid verification code.\n\n`
      detailedMessage += `• Expected current code: ${currentCode}\n`
      detailedMessage += `• Your code: ${validatedData.verificationCode}\n`
      detailedMessage += `• Server time: ${timeCheck.serverTime}\n`
      detailedMessage += `• Next code in: ${timeCheck.nextCodeIn} seconds\n\n`
      detailedMessage += `${timeCheck.recommendation}\n\n`
      detailedMessage += `Please:\n`
      detailedMessage += `1. Check your device time is synchronized\n`
      detailedMessage += `2. Wait for a fresh code (codes change every 30 seconds)\n`
      detailedMessage += `3. Enter the current code from your authenticator app`
      
      return {
        success: false,
        message: detailedMessage,
        errors: { verificationCode: 'Invalid verification code' }
      }
    }

    // Generate backup codes and enable 2FA
    const backupCodes = generateNewBackupCodes()
    const encryptedBackupCodes = encryptBackupCodes(backupCodes)

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: validatedData.encryptedSecret, // Already encrypted
        backupCodes: encryptedBackupCodes,
        twoFactorEnabledAt: new Date()
      }
    })

    // Send security alert
    await sendSecurityAlert(
      user.email,
      user.name || '',
      '2fa_enabled',
      'Two-factor authentication has been enabled on your account'
    )

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId,
      eventType: '2fa_enabled',
      details: 'Two-factor authentication enabled',
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: '2FA enabled successfully',
      data: { backupCodes }
    }

  } catch (error) {
    console.error('Enable 2FA error:', error)

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {}
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message
        }
      })
      return {
        success: false,
        message: 'Please check the form for errors',
        errors
      }
    }

    return {
      success: false,
      message: 'Failed to enable 2FA'
    }
  }
}

const verify2FASchema = z.object({
  code: z.string().min(6).max(8),
  useBackupCode: z.boolean().optional()
})

export async function verifyTwoFactorCode(formData: FormData, userId: string): Promise<ActionResult> {
  try {
    const data = {
      code: formData.get('code') as string,
      useBackupCode: formData.get('useBackupCode') === 'true'
    }

    const validatedData = verify2FASchema.parse(data)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        backupCodes: true
      }
    })

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return {
        success: false,
        message: '2FA is not enabled for this user'
      }
    }

    let isValid = false
    let updatedBackupCodes = user.backupCodes

    if (validatedData.useBackupCode) {
      // Validate backup code
      if (!isValidBackupCodeFormat(validatedData.code)) {
        return {
          success: false,
          message: 'Invalid backup code format'
        }
      }

      const result = validateBackupCode(validatedData.code, user.backupCodes)
      isValid = result.valid
      updatedBackupCodes = result.remainingCodes

      if (isValid) {
        // Update user's backup codes (remove used code)
        await prisma.user.update({
          where: { id: userId },
          data: { backupCodes: updatedBackupCodes }
        })
      }
    } else {
      // Validate TOTP code
      if (!isValidTOTPFormat(validatedData.code)) {
        return {
          success: false,
          message: 'Invalid verification code format'
        }
      }

      const secret = decrypt(user.twoFactorSecret)
      isValid = validateTOTPCode(validatedData.code, secret)
    }

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId,
      eventType: isValid ? '2fa_verified' : '2fa_failed',
      details: isValid 
        ? `2FA verified using ${validatedData.useBackupCode ? 'backup code' : 'TOTP'}`
        : `2FA verification failed using ${validatedData.useBackupCode ? 'backup code' : 'TOTP'}`,
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined,
      success: isValid
    })

    if (isValid) {
      return {
        success: true,
        message: '2FA verified successfully',
        data: {
          remainingBackupCodes: updatedBackupCodes.length
        }
      }
    } else {
      return {
        success: false,
        message: 'Invalid verification code'
      }
    }

  } catch (error) {
    console.error('Verify 2FA error:', error)
    return {
      success: false,
      message: 'Failed to verify 2FA code'
    }
  }
}

export async function disableTwoFactorAuth(userId: string): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, twoFactorEnabled: true }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    if (!user.twoFactorEnabled) {
      return {
        success: false,
        message: '2FA is not enabled'
      }
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        twoFactorEnabledAt: null
      }
    })

    // Send security alert
    await sendSecurityAlert(
      user.email,
      user.name || '',
      '2fa_enabled', // Reuse template but with different message
      'Two-factor authentication has been disabled on your account'
    )

    // Log security event
    const headersList = await headers()
    await logSecurityEvent({
      userId,
      eventType: '2fa_disabled',
      details: 'Two-factor authentication disabled',
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined
    })

    return {
      success: true,
      message: '2FA disabled successfully'
    }

  } catch (error) {
    console.error('Disable 2FA error:', error)
    return {
      success: false,
      message: 'Failed to disable 2FA'
    }
  }
}

// Get comprehensive user account information including verification status
export async function getEnhancedUserAccountInfo(userId: string): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            provider: true,
            type: true
          }
        }
      }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    const hasGoogleAccount = user.accounts.some(account => account.provider === 'google')
    const hasPassword = !!user.password

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        emailVerificationRequired: user.emailVerificationRequired,
        hasGoogleAccount,
        hasPassword,
        hasEmailAccount: hasPassword,
        primaryAuthMethod: user.primaryAuthMethod,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        backupCodesCount: user.backupCodes.length,
        passwordSetAt: user.passwordSetAt,
        lastPasswordChange: user.lastPasswordChange,
        lastLoginAt: user.lastLoginAt,
        accounts: user.accounts,
        createdAt: user.createdAt
      }
    }

  } catch (error) {
    console.error('Get enhanced user account info error:', error)
    return {
      success: false,
      message: 'Failed to fetch account information'
    }
  }
}

// Get security events for user
export async function getUserSecurityEvents(
  userId: string,
  limit: number = 20
): Promise<ActionResult> {
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        details: true,
        ipAddress: true,
        success: true,
        createdAt: true
      }
    })

    return {
      success: true,
      data: events
    }

  } catch (error) {
    console.error('Get security events error:', error)
    return {
      success: false,
      message: 'Failed to fetch security events'
    }
  }
}

// Complete 2FA authentication after successful verification
export async function complete2FAAuthentication(userId: string): Promise<ActionResult> {
  try {
    // Verify the temporary session exists
    if (!global.tempAuth2FA?.has(userId)) {
      return {
        success: false,
        message: 'Invalid or expired authentication session'
      }
    }

    const tempSession = global.tempAuth2FA.get(userId)
    
    // Check if session is not too old (5 minutes max)
    if (Date.now() - tempSession.timestamp > 5 * 60 * 1000) {
      global.tempAuth2FA.delete(userId)
      return {
        success: false,
        message: 'Authentication session expired'
      }
    }

    // Update user's last login and 2FA verification time
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date()
      }
    })

    // Log successful 2FA verification
    const headersList = await headers()
    await logSecurityEvent({
      userId,
      eventType: '2fa_verified',
      details: 'Two-factor authentication verified successfully during login',
      ipAddress: getClientIP(headersList),
      userAgent: headersList.get('user-agent') || undefined,
      success: true
    })

    // Clean up temporary session
    global.tempAuth2FA.delete(userId)

    return {
      success: true,
      message: '2FA authentication completed successfully',
      data: {
        userId,
        provider: tempSession.provider
      }
    }

  } catch (error) {
    console.error('Complete 2FA authentication error:', error)
    return {
      success: false,
      message: 'Failed to complete 2FA authentication'
    }
  }
}