import { Page } from '@playwright/test'
import { BasePage } from './base.page'

/**
 * Register Page Object
 * Handles all interactions with the registration page
 */
export class RegisterPage extends BasePage {
  // Selectors
  private readonly selectors = {
    nameInput: 'input[name="name"]',
    emailInput: 'input[name="email"]',
    passwordInput: 'input[name="password"]',
    confirmPasswordInput: 'input[name="confirmPassword"]',
    submitButton: 'button[type="submit"]',
    termsCheckbox: 'input[name="acceptTerms"]',
    newsletterCheckbox: 'input[name="newsletter"]',
    signInLink: 'a:has-text("Sign in")',
    googleButton: 'button:has-text("Sign up with Google")',
    githubButton: 'button:has-text("Sign up with GitHub")',
    errorMessage: '[data-testid="register-error"]',
    successMessage: '[data-testid="register-success"]',
    loadingSpinner: '[data-testid="loading-spinner"]',
    passwordStrength: '[data-testid="password-strength"]',
    emailVerificationMessage: '[data-testid="email-verification"]',
    resendEmailButton: 'button:has-text("Resend email")',
  }
  
  constructor(page: Page) {
    super(page)
  }
  
  /**
   * Navigate to register page
   */
  async goto() {
    await super.goto('/en/register')
    await this.waitForPageLoad()
  }
  
  /**
   * Fill registration form
   */
  async fillRegistrationForm(data: {
    name: string
    email: string
    password: string
    confirmPassword?: string
  }) {
    await this.fillField(this.selectors.nameInput, data.name)
    await this.fillField(this.selectors.emailInput, data.email)
    await this.fillField(this.selectors.passwordInput, data.password)
    await this.fillField(
      this.selectors.confirmPasswordInput, 
      data.confirmPassword || data.password
    )
  }
  
  /**
   * Submit registration form
   */
  async submitRegistration() {
    const button = this.page.locator(this.selectors.submitButton)
    await button.click()
  }
  
  /**
   * Complete registration flow
   */
  async register(data: {
    name: string
    email: string
    password: string
    confirmPassword?: string
    acceptTerms?: boolean
    newsletter?: boolean
  }) {
    await this.fillRegistrationForm(data)
    
    // IMPORTANT: Terms checkbox is REQUIRED for registration
    // If acceptTerms is true or undefined, we check it
    if (data.acceptTerms !== false) {
      // Always try to check the terms checkbox if not explicitly false
      const termsCheckbox = this.page.locator('input[name="terms"], input[type="checkbox"]').first()
      if (await termsCheckbox.count() > 0) {
        await termsCheckbox.check()
      }
    }
    
    if (data.newsletter) {
      await this.subscribeNewsletter()
    }
    
    // Wait for form state to update
    await this.page.waitForTimeout(500)
    
    // Now submit - button should be enabled if terms are checked
    await this.submitRegistration()
    
    // Wait for navigation or response
    await this.page.waitForTimeout(2000)
  }
  
  /**
   * Register with OAuth provider
   */
  async registerWithOAuth(provider: 'google' | 'github') {
    const selector = provider === 'google' 
      ? this.selectors.googleButton 
      : this.selectors.githubButton
    
    await this.page.click(selector)
    
    // Handle OAuth flow in new window/tab if needed
    const [popup] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.page.click(selector)
    ]).catch(() => [null])
    
    if (popup) {
      // Handle OAuth provider registration in popup
      await popup.waitForLoadState()
      // Add provider-specific logic here
      await popup.close()
    }
  }
  
  /**
   * Accept terms and conditions
   */
  async acceptTerms() {
    // Try multiple selectors for checkbox
    const checkboxSelectors = [
      this.selectors.termsCheckbox,
      'input[type="checkbox"]',
      'input[id*="terms"]',
      'input[id*="accept"]'
    ]
    
    for (const selector of checkboxSelectors) {
      if (await this.page.locator(selector).count() > 0) {
        await this.page.click(selector)
        return
      }
    }
    
    // If no checkbox found, it might not be required
    console.log('No terms checkbox found - might not be required')
  }
  
  /**
   * Subscribe to newsletter
   */
  async subscribeNewsletter() {
    await this.page.click(this.selectors.newsletterCheckbox)
  }
  
  /**
   * Click sign in link
   */
  async clickSignIn() {
    await this.page.click(this.selectors.signInLink)
    await this.waitForNavigation()
  }
  
  /**
   * Check if registration was successful
   */
  async isRegistrationSuccessful(): Promise<boolean> {
    return await this.elementExists(this.selectors.successMessage) ||
           await this.elementExists(this.selectors.emailVerificationMessage) ||
           await this.hasText('Please verify your email') ||
           await this.hasText('Registration successful')
  }
  
  /**
   * Get registration error message
   */
  async getRegistrationError(): Promise<string | null> {
    if (await this.elementExists(this.selectors.errorMessage)) {
      return await this.getText(this.selectors.errorMessage)
    }
    return await this.getErrorMessage()
  }
  
  /**
   * Check if email verification is required
   */
  async isEmailVerificationRequired(): Promise<boolean> {
    return await this.elementExists(this.selectors.emailVerificationMessage) ||
           await this.hasText('verify your email')
  }
  
  /**
   * Resend verification email
   */
  async resendVerificationEmail() {
    await this.page.click(this.selectors.resendEmailButton)
  }
  
  /**
   * Get password strength indicator
   */
  async getPasswordStrength(): Promise<string | null> {
    if (await this.elementExists(this.selectors.passwordStrength)) {
      return await this.getText(this.selectors.passwordStrength)
    }
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
    
    // Check for requirement indicators
    const indicators = await this.page.$$('[data-testid^="password-req-"]')
    for (const indicator of indicators) {
      const testId = await indicator.getAttribute('data-testid')
      const isValid = await indicator.getAttribute('data-valid') === 'true'
      
      if (testId?.includes('length')) requirements.length = isValid
      if (testId?.includes('uppercase')) requirements.uppercase = isValid
      if (testId?.includes('lowercase')) requirements.lowercase = isValid
      if (testId?.includes('number')) requirements.number = isValid
      if (testId?.includes('special')) requirements.special = isValid
    }
    
    return requirements
  }
  
  /**
   * Get form validation errors
   */
  async getValidationErrors(): Promise<Record<string, string>> {
    const errors: Record<string, string> = {}
    
    // Check name field error
    const nameError = await this.page.locator(`${this.selectors.nameInput} ~ .error-message`).textContent()
    if (nameError) errors.name = nameError
    
    // Check email field error
    const emailError = await this.page.locator(`${this.selectors.emailInput} ~ .error-message`).textContent()
    if (emailError) errors.email = emailError
    
    // Check password field error
    const passwordError = await this.page.locator(`${this.selectors.passwordInput} ~ .error-message`).textContent()
    if (passwordError) errors.password = passwordError
    
    // Check confirm password field error
    const confirmError = await this.page.locator(`${this.selectors.confirmPasswordInput} ~ .error-message`).textContent()
    if (confirmError) errors.confirmPassword = confirmError
    
    return errors
  }
  
  /**
   * Assert registration page is displayed
   */
  async assertRegistrationPageDisplayed() {
    await this.assertVisible(this.selectors.nameInput)
    await this.assertVisible(this.selectors.emailInput)
    await this.assertVisible(this.selectors.passwordInput)
    await this.assertVisible(this.selectors.confirmPasswordInput)
    await this.assertVisible(this.selectors.submitButton)
  }
  
  /**
   * Assert registration error is displayed
   */
  async assertRegistrationError(expectedError?: string) {
    await this.assertVisible(this.selectors.errorMessage)
    if (expectedError) {
      await this.assertText(this.selectors.errorMessage, expectedError)
    }
  }
  
  /**
   * Assert registration success
   */
  async assertRegistrationSuccess() {
    const success = await this.isRegistrationSuccessful()
    if (!success) {
      throw new Error('Registration was not successful')
    }
  }
  
  /**
   * Assert email verification required
   */
  async assertEmailVerificationRequired() {
    const required = await this.isEmailVerificationRequired()
    if (!required) {
      throw new Error('Email verification message not displayed')
    }
  }
  
  /**
   * Check if loading
   */
  async isLoading(): Promise<boolean> {
    return await this.elementExists(this.selectors.loadingSpinner)
  }
  
  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete() {
    await this.page.waitForSelector(this.selectors.loadingSpinner, { state: 'hidden' })
  }
  
  /**
   * Generate random user data
   */
  static generateRandomUser() {
    const timestamp = Date.now()
    return {
      name: `Test User ${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'Test123!@#',
      confirmPassword: 'Test123!@#'
    }
  }
}