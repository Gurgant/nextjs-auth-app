import { Page } from '@playwright/test'
import { BasePage } from './base.page'

/**
 * Password Reset Page Object
 * Handles password reset request and confirmation flows
 */
export class PasswordResetPage extends BasePage {
  // Selectors for different states of password reset
  private readonly selectors = {
    // Request reset page
    request: {
      title: 'h1:has-text("Reset Password")',
      subtitle: 'p:has-text("Enter your email")',
      emailInput: 'input[name="email"], input[type="email"]',
      submitButton: 'button[type="submit"]:has-text("Send Reset Link")',
      backToLoginLink: 'a:has-text("Back to login")',
      successMessage: '[data-testid="reset-success"], [role="alert"].success',
      errorMessage: '[data-testid="reset-error"], [role="alert"].error',
      loadingSpinner: '[data-testid="loading"]',
      captcha: '[data-testid="captcha"]',
      resendButton: 'button:has-text("Resend")',
      emailSentIcon: '[data-testid="email-sent-icon"]'
    },
    
    // Reset confirmation page (with token)
    confirmation: {
      title: 'h1:has-text("Set New Password")',
      tokenInput: 'input[name="token"], input[name="code"]',
      passwordInput: 'input[name="password"], input[name="newPassword"]',
      confirmPasswordInput: 'input[name="confirmPassword"]',
      submitButton: 'button[type="submit"]:has-text("Reset Password")',
      passwordStrength: '[data-testid="password-strength"]',
      passwordRequirements: '[data-testid="password-requirements"]',
      successMessage: '[data-testid="reset-complete"]',
      errorMessage: '[data-testid="reset-error"]',
      expiredTokenMessage: 'text=/expired|invalid token/i',
      backToLoginButton: 'a:has-text("Back to login")'
    },
    
    // Common elements
    form: 'form',
    validationError: '.error-message, [role="alert"].error',
    infoMessage: '[role="status"], .info-message',
    progressBar: '[role="progressbar"]',
    modal: '[role="dialog"]',
    modalClose: '[role="dialog"] button[aria-label="Close"]'
  }
  
  constructor(page: Page) {
    super(page)
  }
  
  /**
   * Navigate to password reset request page
   */
  async goto() {
    await super.goto('/en/auth/reset-password')
    await this.waitForPageLoad()
  }
  
  /**
   * Navigate to reset confirmation with token
   */
  async gotoWithToken(token: string) {
    await super.goto(`/en/auth/reset-password?token=${token}`)
    await this.waitForPageLoad()
  }
  
  // ========== Request Reset Flow ==========
  
  /**
   * Request password reset for email
   */
  async requestPasswordReset(email: string) {
    // Fill email
    await this.fillField(this.selectors.request.emailInput, email)
    
    // Handle captcha if present
    if (await this.elementExists(this.selectors.request.captcha)) {
      await this.handleCaptcha()
    }
    
    // Submit form
    await this.page.click(this.selectors.request.submitButton)
    
    // Wait for response
    await this.waitForResetResponse()
  }
  
  /**
   * Wait for reset request response
   */
  async waitForResetResponse() {
    await Promise.race([
      this.page.waitForSelector(this.selectors.request.successMessage, { timeout: 10000 }),
      this.page.waitForSelector(this.selectors.request.errorMessage, { timeout: 10000 }),
      this.page.waitForSelector(this.selectors.request.emailSentIcon, { timeout: 10000 })
    ])
  }
  
  /**
   * Check if reset email was sent
   */
  async isResetEmailSent(): Promise<boolean> {
    return await this.elementExists(this.selectors.request.successMessage) ||
           await this.elementExists(this.selectors.request.emailSentIcon) ||
           await this.hasText('email.*sent')
  }
  
  /**
   * Get reset request error
   */
  async getResetRequestError(): Promise<string | null> {
    if (await this.elementExists(this.selectors.request.errorMessage)) {
      return await this.getText(this.selectors.request.errorMessage)
    }
    return null
  }
  
  /**
   * Resend reset email
   */
  async resendResetEmail() {
    if (await this.elementExists(this.selectors.request.resendButton)) {
      await this.page.click(this.selectors.request.resendButton)
      await this.waitForResetResponse()
    }
  }
  
  /**
   * Navigate back to login
   */
  async backToLogin() {
    await this.page.click(this.selectors.request.backToLoginLink)
    await this.waitForNavigation()
  }
  
  // ========== Reset Confirmation Flow ==========
  
  /**
   * Complete password reset with token
   */
  async resetPasswordWithToken(token: string, newPassword: string) {
    // Enter token if field exists
    if (await this.elementExists(this.selectors.confirmation.tokenInput)) {
      await this.fillField(this.selectors.confirmation.tokenInput, token)
    }
    
    // Enter new password
    await this.fillField(this.selectors.confirmation.passwordInput, newPassword)
    await this.fillField(this.selectors.confirmation.confirmPasswordInput, newPassword)
    
    // Check password strength if indicator exists
    if (await this.elementExists(this.selectors.confirmation.passwordStrength)) {
      await this.waitForPasswordStrengthUpdate()
    }
    
    // Submit form
    await this.page.click(this.selectors.confirmation.submitButton)
    
    // Wait for response
    await this.waitForResetConfirmationResponse()
  }
  
  /**
   * Wait for reset confirmation response
   */
  async waitForResetConfirmationResponse() {
    await Promise.race([
      this.page.waitForSelector(this.selectors.confirmation.successMessage, { timeout: 10000 }),
      this.page.waitForSelector(this.selectors.confirmation.errorMessage, { timeout: 10000 }),
      this.page.waitForURL(/login|signin/, { timeout: 10000 })
    ])
  }
  
  /**
   * Check if password was reset successfully
   */
  async isPasswordResetSuccessful(): Promise<boolean> {
    return await this.elementExists(this.selectors.confirmation.successMessage) ||
           await this.hasText('password.*reset.*success') ||
           this.page.url().includes('login')
  }
  
  /**
   * Get reset confirmation error
   */
  async getResetConfirmationError(): Promise<string | null> {
    if (await this.elementExists(this.selectors.confirmation.errorMessage)) {
      return await this.getText(this.selectors.confirmation.errorMessage)
    }
    
    if (await this.elementExists(this.selectors.confirmation.expiredTokenMessage)) {
      return 'Token expired or invalid'
    }
    
    return null
  }
  
  /**
   * Check if token is expired
   */
  async isTokenExpired(): Promise<boolean> {
    return await this.elementExists(this.selectors.confirmation.expiredTokenMessage) ||
           await this.hasText('expired') ||
           await this.hasText('invalid token')
  }
  
  // ========== Password Validation ==========
  
  /**
   * Get password strength
   */
  async getPasswordStrength(): Promise<'weak' | 'medium' | 'strong' | null> {
    if (!await this.elementExists(this.selectors.confirmation.passwordStrength)) {
      return null
    }
    
    const strengthText = await this.getText(this.selectors.confirmation.passwordStrength)
    const strengthLower = strengthText?.toLowerCase() || ''
    
    if (strengthLower.includes('weak')) return 'weak'
    if (strengthLower.includes('medium')) return 'medium'
    if (strengthLower.includes('strong')) return 'strong'
    
    // Check by color/class
    const element = this.page.locator(this.selectors.confirmation.passwordStrength)
    const classes = await element.getAttribute('class')
    
    if (classes?.includes('weak')) return 'weak'
    if (classes?.includes('medium')) return 'medium'
    if (classes?.includes('strong')) return 'strong'
    
    return null
  }
  
  /**
   * Check password requirements
   */
  async checkPasswordRequirements(): Promise<{
    length: boolean
    uppercase: boolean
    lowercase: boolean
    number: boolean
    special: boolean
  }> {
    const requirements = {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    }
    
    if (!await this.elementExists(this.selectors.confirmation.passwordRequirements)) {
      // If no requirements shown, assume all are met
      return Object.fromEntries(Object.keys(requirements).map(k => [k, true])) as typeof requirements
    }
    
    // Check each requirement indicator
    const indicators = await this.page.$$('[data-testid^="password-req-"]')
    for (const indicator of indicators) {
      const testId = await indicator.getAttribute('data-testid')
      const isValid = await indicator.getAttribute('data-valid') === 'true' ||
                     await indicator.getAttribute('aria-checked') === 'true'
      
      if (testId?.includes('length')) requirements.length = isValid
      if (testId?.includes('uppercase')) requirements.uppercase = isValid
      if (testId?.includes('lowercase')) requirements.lowercase = isValid
      if (testId?.includes('number')) requirements.number = isValid
      if (testId?.includes('special')) requirements.special = isValid
    }
    
    return requirements
  }
  
  /**
   * Wait for password strength to update
   */
  async waitForPasswordStrengthUpdate() {
    await this.page.waitForTimeout(500) // Brief wait for strength calculation
  }
  
  // ========== Validation Helpers ==========
  
  /**
   * Get validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page.locator(this.selectors.validationError).allTextContents()
    return errors.filter(e => e.trim().length > 0)
  }
  
  /**
   * Check if on request page
   */
  async isOnRequestPage(): Promise<boolean> {
    return await this.elementExists(this.selectors.request.emailInput) &&
           await this.elementExists(this.selectors.request.submitButton)
  }
  
  /**
   * Check if on confirmation page
   */
  async isOnConfirmationPage(): Promise<boolean> {
    return await this.elementExists(this.selectors.confirmation.passwordInput) &&
           await this.elementExists(this.selectors.confirmation.confirmPasswordInput)
  }
  
  /**
   * Handle captcha if present
   */
  private async handleCaptcha() {
    // This would need actual implementation based on captcha type
    // For testing, we might mock or bypass
    console.log('Captcha detected - handling would go here')
    await this.page.waitForTimeout(1000)
  }
  
  // ========== Assertions ==========
  
  /**
   * Assert reset email sent
   */
  async assertResetEmailSent() {
    const sent = await this.isResetEmailSent()
    if (!sent) {
      throw new Error('Password reset email was not sent')
    }
  }
  
  /**
   * Assert password reset successful
   */
  async assertPasswordResetSuccessful() {
    const success = await this.isPasswordResetSuccessful()
    if (!success) {
      throw new Error('Password reset was not successful')
    }
  }
  
  /**
   * Assert on correct page
   */
  async assertOnResetPage() {
    const onRequest = await this.isOnRequestPage()
    const onConfirmation = await this.isOnConfirmationPage()
    
    if (!onRequest && !onConfirmation) {
      throw new Error('Not on password reset page')
    }
  }
  
  // ========== Test Helpers ==========
  
  /**
   * Complete full reset flow (for testing)
   */
  async completeFullResetFlow(email: string, token: string, newPassword: string) {
    // Request reset
    await this.goto()
    await this.requestPasswordReset(email)
    await this.assertResetEmailSent()
    
    // Use token to reset
    await this.gotoWithToken(token)
    await this.resetPasswordWithToken(token, newPassword)
    await this.assertPasswordResetSuccessful()
  }
  
  /**
   * Generate test reset token
   */
  static generateTestToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15)
  }
}