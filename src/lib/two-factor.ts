import { authenticator } from 'otplib'
import * as QRCode from 'qrcode'
import { encrypt, decrypt, generateBackupCodes } from '@/lib/security'

// TOTP configuration - using const instead of direct assignment to avoid read-only errors
const TOTP_OPTIONS = {
  window: [3, 3], // Allow 3 steps before and after current time step (3 minutes tolerance)
  step: 30, // 30-second time step
  digits: 6, // 6-digit codes
  algorithm: 'sha1', // Explicitly set algorithm
  encoding: 'ascii' // Ensure proper encoding
}

// Safe configuration - only set if options is writable
try {
  Object.assign(authenticator.options, TOTP_OPTIONS)
  console.log('🔧 TOTP Config applied successfully')
} catch (error) {
  console.log('🔧 TOTP Config: Using method-level options due to read-only options')
}

// Debug the configuration
console.log('🔧 Current TOTP Config:', {
  window: authenticator.options.window || TOTP_OPTIONS.window,
  step: authenticator.options.step || TOTP_OPTIONS.step,
  digits: authenticator.options.digits || TOTP_OPTIONS.digits,
  algorithm: authenticator.options.algorithm || TOTP_OPTIONS.algorithm,
  encoding: authenticator.options.encoding || TOTP_OPTIONS.encoding
})

export interface TwoFactorSetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export interface TwoFactorInfo {
  enabled: boolean
  backupCodesCount: number
  enabledAt?: Date
}

// Generate a new TOTP secret for a user
export function generateTOTPSecret(): string {
  const secret = authenticator.generateSecret()
  console.log('🔑 Secret Generation - Length:', secret.length)
  console.log('🔑 Secret Generation - First 8 chars:', secret.substring(0, 8))
  console.log('🔑 Secret Generation - Is Base32:', /^[A-Z2-7]+$/.test(secret))
  
  // Ensure the secret is properly formatted
  const normalizedSecret = secret.toUpperCase().replace(/[^A-Z2-7]/g, '')
  console.log('🔑 Secret Generation - Normalized length:', normalizedSecret.length)
  
  return normalizedSecret
}

// Generate QR code URL for TOTP setup
export async function generateQRCode(
  secret: string,
  userEmail: string,
  issuer: string = 'Auth App'
): Promise<string> {
  try {
    console.log('📱 QR Generation - Email:', userEmail)
    console.log('📱 QR Generation - Issuer:', issuer)
    console.log('📱 QR Generation - Secret length:', secret.length)
    
    // Ensure secret is properly formatted (Base32)
    const normalizedSecret = secret.toUpperCase().replace(/[^A-Z2-7]/g, '')
    console.log('📱 QR Generation - Normalized secret length:', normalizedSecret.length)
    
    // Generate the TOTP URL with explicit parameters  
    const otpUrl = authenticator.keyuri(userEmail, issuer, normalizedSecret)
    console.log('📱 QR Generation - OTP URL:', otpUrl)
    
    // CRITICAL: Verify the secret in the URL matches what we're displaying
    const urlMatch = otpUrl.match(/secret=([A-Z2-7]+)/i)
    const urlSecret = urlMatch ? urlMatch[1] : 'NOT_FOUND'
    console.log('📱 QR Generation - Secret in URL:', urlSecret)
    console.log('📱 QR Generation - Secret matches input:', urlSecret === normalizedSecret)
    
    // Validate the URL format
    if (!otpUrl.startsWith('otpauth://totp/')) {
      throw new Error('Invalid OTP URL format')
    }
    
    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(otpUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    })
    
    console.log('📱 QR Generation - QR code URL length:', qrCodeUrl.length)
    console.log('📱 QR Generation - QR code starts with:', qrCodeUrl.substring(0, 30) + '...')
    
    return qrCodeUrl
  } catch (error) {
    console.error('❌ Error generating QR code:', error)
    throw new Error('Failed to generate QR code')
  }
}

// Alternative validation with larger tolerance
export function validateTOTPCodeWithLargeTolerance(token: string, secret: string): boolean {
  try {
    const normalizedToken = token.replace(/\s/g, '')
    const normalizedSecret = secret.trim().toUpperCase()
    
    // Try with very large window (10 minutes total tolerance) using method-level options
    const result = authenticator.verify({ 
      token: normalizedToken, 
      secret: normalizedSecret,
      window: [10, 10] // 10 * 30 seconds = 5 minutes each direction
    })
    
    console.log('🔍 Large tolerance validation result:', result)
    return result
  } catch (error) {
    console.error('❌ Large tolerance validation error:', error)
    return false
  }
}

// Validate TOTP code with enhanced debugging
export function validateTOTPCode(token: string, secret: string): boolean {
  try {
    console.log('🔍 TOTP Validation - Token:', token)
    console.log('🔍 TOTP Validation - Secret length:', secret.length)
    console.log('🔍 TOTP Validation - Secret format check:', /^[A-Z2-7]+$/.test(secret))
    
    // Normalize token (remove spaces, ensure it's exactly 6 digits)
    const normalizedToken = token.replace(/\s/g, '')
    console.log('🔍 TOTP Validation - Normalized token:', normalizedToken)
    
    if (!/^\d{6}$/.test(normalizedToken)) {
      console.error('❌ TOTP Validation - Invalid token format:', normalizedToken)
      return false
    }
    
    // Test with current configuration using method-level options
    const result = authenticator.verify({ 
      token: normalizedToken, 
      secret: secret.trim().toUpperCase(),
      window: TOTP_OPTIONS.window
    })
    
    console.log('🔍 TOTP Validation - Result:', result)
    
    // If failed, try with different configurations
    if (!result) {
      console.log('🔍 TOTP Validation - Trying alternative configurations...')
      
      // Try larger window using method-level options
      const largerWindowResult = authenticator.verify({ 
        token: normalizedToken, 
        secret: secret.trim().toUpperCase(),
        window: [5, 5]
      })
      console.log('🔍 TOTP Validation - Larger window result:', largerWindowResult)
      
      return largerWindowResult
    }
    
    return result
  } catch (error) {
    console.error('❌ Error validating TOTP code:', error)
    console.error('❌ Token:', token)
    console.error('❌ Secret length:', secret?.length)
    return false
  }
}

// Validate backup code
export function validateBackupCode(code: string, encryptedBackupCodes: string[]): { valid: boolean; remainingCodes: string[] } {
  try {
    const normalizedInput = code.replace(/[-\s]/g, '').toUpperCase()
    const remainingCodes: string[] = []
    let codeFound = false

    for (const encryptedCode of encryptedBackupCodes) {
      try {
        const decryptedCode = decrypt(encryptedCode).replace(/[-\s]/g, '').toUpperCase()
        
        if (decryptedCode === normalizedInput && !codeFound) {
          codeFound = true
          // Don't add the used code to remaining codes
        } else {
          remainingCodes.push(encryptedCode)
        }
      } catch (error) {
        console.error('Error decrypting backup code:', error)
        // Keep the code if we can't decrypt it
        remainingCodes.push(encryptedCode)
      }
    }

    return {
      valid: codeFound,
      remainingCodes
    }
  } catch (error) {
    console.error('Error validating backup code:', error)
    return {
      valid: false,
      remainingCodes: encryptedBackupCodes
    }
  }
}

// Setup 2FA for a user (generate secret, QR code, and backup codes)
export async function setupTwoFactor(userEmail: string): Promise<TwoFactorSetup> {
  try {
    // Generate secret and backup codes
    const secret = generateTOTPSecret()
    const backupCodes = generateBackupCodes(8) // Generate 8 backup codes
    
    // Generate QR code
    const qrCodeUrl = await generateQRCode(secret, userEmail)
    
    return {
      secret,
      qrCodeUrl,
      backupCodes
    }
  } catch (error) {
    console.error('Error setting up 2FA:', error)
    throw new Error('Failed to setup two-factor authentication')
  }
}

// Encrypt backup codes for storage
export function encryptBackupCodes(codes: string[]): string[] {
  return codes.map(code => encrypt(code))
}

// Decrypt backup codes for display (use sparingly)
export function decryptBackupCodes(encryptedCodes: string[]): string[] {
  return encryptedCodes.map(code => {
    try {
      return decrypt(code)
    } catch (error) {
      console.error('Error decrypting backup code:', error)
      return '****-****' // Return masked code on error
    }
  })
}

// Generate new backup codes (for when user needs fresh codes)
export function generateNewBackupCodes(): string[] {
  return generateBackupCodes(8)
}

// Check if TOTP code format is valid
export function isValidTOTPFormat(code: string): boolean {
  const cleanCode = code.replace(/\s/g, '')
  return /^\d{6}$/.test(cleanCode)
}

// Check if backup code format is valid
export function isValidBackupCodeFormat(code: string): boolean {
  const cleanCode = code.replace(/[-\s]/g, '').toUpperCase()
  return /^[A-Z0-9]{8}$/.test(cleanCode)
}

// Generate TOTP URL for manual entry (when QR code can't be scanned)
export function generateTOTPUrl(
  secret: string,
  userEmail: string,
  issuer: string = 'Auth App'
): string {
  return authenticator.keyuri(userEmail, issuer, secret)
}

// Get current TOTP code (for testing purposes)
export function getCurrentTOTPCode(secret: string): string {
  return authenticator.generate(secret)
}

// Get time remaining until next TOTP code
export function getTimeRemaining(): number {
  const now = Date.now()
  const step = authenticator.options.step * 1000 // Convert to milliseconds
  return step - (now % step)
}

// Verify if secret is valid
export function isValidSecret(secret: string): boolean {
  try {
    // Try to generate a code with the secret
    authenticator.generate(secret)
    return true
  } catch (error) {
    return false
  }
}

// Format backup code for display (add dash in middle)
export function formatBackupCode(code: string): string {
  const cleanCode = code.replace(/[-\s]/g, '').toUpperCase()
  if (cleanCode.length === 8) {
    return `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}`
  }
  return code
}

// Count remaining backup codes
export function countRemainingBackupCodes(encryptedCodes: string[]): number {
  return encryptedCodes.length
}

// Check if 2FA is required for user
export function requiresTwoFactor(user: { twoFactorEnabled: boolean }): boolean {
  return user.twoFactorEnabled
}

// Diagnostic function to test TOTP configuration
export function diagnoseTOTPIssue(secret: string, userCode: string): {
  secretValid: boolean
  codeFormat: boolean
  currentCode: string
  windowCodes: string[]
  timeDrift: number
  validationResults: boolean[]
} {
  console.log('🔬 TOTP Diagnosis Starting...')
  
  const secretValid = isValidSecret(secret)
  const codeFormat = /^\d{6}$/.test(userCode)
  const currentCode = getCurrentTOTPCode(secret)
  const currentTime = Math.floor(Date.now() / 1000)
  const timeStep = 30
  const timeDrift = currentTime % timeStep
  
  // Generate codes for surrounding windows
  const windowCodes: string[] = []
  const validationResults: boolean[] = []
  
  for (let i = -3; i <= 3; i++) {
    const windowTime = currentTime + (i * timeStep)
    try {
      const windowCode = authenticator.generate(secret, windowTime)
      windowCodes.push(`${i === 0 ? '*' : ''}${windowCode}${i === 0 ? '*' : ''} (${i})`)
      
      // Test validation for each window
      const isValid = authenticator.verify({ 
        token: userCode, 
        secret: secret.trim().toUpperCase(),
        window: [Math.abs(i), Math.abs(i)]
      })
      validationResults.push(isValid)
    } catch (error) {
      windowCodes.push(`ERROR (${i})`)
      validationResults.push(false)
    }
  }
  
  const result = {
    secretValid,
    codeFormat,
    currentCode,
    windowCodes,
    timeDrift,
    validationResults
  }
  
  console.log('🔬 TOTP Diagnosis Results:', result)
  
  return result
}

// Time synchronization check
export function checkTimeSynchronization(): {
  serverTime: string
  serverTimestamp: number
  currentWindow: number
  nextCodeIn: number
  recommendation: string
} {
  const now = Date.now()
  const currentTime = Math.floor(now / 1000)
  const timeStep = 30
  const currentWindow = Math.floor(currentTime / timeStep)
  const nextCodeIn = timeStep - (currentTime % timeStep)
  
  let recommendation = 'Time appears synchronized'
  if (nextCodeIn < 5) {
    recommendation = 'WARNING: Code will change soon! Wait for next code.'
  } else if (nextCodeIn > 25) {
    recommendation = 'WARNING: Code just changed. Try current code.'
  }
  
  return {
    serverTime: new Date(now).toISOString(),
    serverTimestamp: currentTime,
    currentWindow,
    nextCodeIn,
    recommendation
  }
}

// Generate 2FA status info
export function getTwoFactorInfo(user: {
  twoFactorEnabled: boolean
  backupCodes: string[]
  twoFactorEnabledAt?: Date | null
}): TwoFactorInfo {
  return {
    enabled: user.twoFactorEnabled,
    backupCodesCount: user.backupCodes.length,
    enabledAt: user.twoFactorEnabledAt || undefined
  }
}