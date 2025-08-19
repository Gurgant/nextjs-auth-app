import { Page } from '@playwright/test'
import { BasePage } from './base.page'

/**
 * Login Page Object
 * Handles all interactions with the login page
 */
export class LoginPage extends BasePage {
  // Selectors
  private readonly selectors = {
    emailSignInButton: 'button:has-text("Sign in with Email")',
    emailInput: 'input[id="email"]',
    passwordInput: 'input[id="password"]',
    submitButton: 'button[type="submit"]',
    rememberMeCheckbox: 'input[name="rememberMe"]',
    forgotPasswordLink: 'a:has-text("Forgot password")',
    signUpLink: 'a:has-text("Register here")',
    googleButton: 'button:has-text("Sign in with Google")',
    githubButton: 'button:has-text("Continue with GitHub")',
    errorMessage: '[role="alert"]',
    successMessage: '[data-testid="login-success"]',
    loadingSpinner: '[data-testid="loading-spinner"]',
    twoFactorInput: 'input[name="code"]',
    resendCodeButton: 'button:has-text("Resend code")',
    backButton: 'button:has-text("Back")',
  }
  
  constructor(page: Page) {
    super(page)
  }
  
  /**
   * Navigate to login page
   */
  async goto() {
    // Go to home page since that's where sign-in is
    await super.goto('/en')
    await this.waitForPageLoad()
  }
  
  /**
   * Fill login form
   */
  async fillLoginForm(email: string, password: string) {
    // First click "Sign in with Email" if form is not visible
    const emailInputVisible = await this.elementExists(this.selectors.emailInput)
    if (!emailInputVisible) {
      await this.page.click(this.selectors.emailSignInButton)
      await this.page.waitForSelector(this.selectors.emailInput, { state: 'visible' })
    }
    
    await this.fillField(this.selectors.emailInput, email)
    await this.fillField(this.selectors.passwordInput, password)
  }
  
  /**
   * Submit login form
   */
  async submitLogin() {
    await this.page.click(this.selectors.submitButton)
  }
  
  /**
   * Complete login flow
   */
  async login(email: string, password: string, rememberMe: boolean = false) {
    await this.fillLoginForm(email, password)
    
    if (rememberMe) {
      await this.toggleRememberMe()
    }
    
    await this.submitLogin()
    
    // Wait for either success or error
    await Promise.race([
      this.page.waitForSelector('[role="alert"]', { timeout: 10000 }).catch(() => null),
      this.page.waitForSelector('text=Dashboard', { timeout: 10000 }).catch(() => null),
      this.page.waitForSelector('text=Welcome', { timeout: 10000 }).catch(() => null),
      this.page.waitForSelector(this.selectors.twoFactorInput, { timeout: 10000 }).catch(() => null),
      this.page.waitForURL(/dashboard/, { timeout: 10000 }).catch(() => null),
    ])
  }
  
  /**
   * Login with OAuth provider
   */
  async loginWithOAuth(provider: 'google' | 'github') {
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
      // Handle OAuth provider login in popup
      await popup.waitForLoadState()
      // Add provider-specific logic here
      await popup.close()
    }
  }
  
  /**
   * Toggle remember me checkbox
   */
  async toggleRememberMe() {
    await this.page.click(this.selectors.rememberMeCheckbox)
  }
  
  /**
   * Click forgot password link
   */
  async clickForgotPassword() {
    await this.page.click(this.selectors.forgotPasswordLink)
    await this.waitForNavigation()
  }
  
  /**
   * Click sign up link
   */
  async clickSignUp() {
    await this.page.click(this.selectors.signUpLink)
    await this.waitForNavigation()
  }
  
  /**
   * Enter 2FA code
   */
  async enter2FACode(code: string) {
    await this.waitForElement(this.selectors.twoFactorInput)
    await this.fillField(this.selectors.twoFactorInput, code)
    await this.page.keyboard.press('Enter')
  }
  
  /**
   * Resend 2FA code
   */
  async resend2FACode() {
    await this.page.click(this.selectors.resendCodeButton)
  }
  
  /**
   * Go back from 2FA
   */
  async goBackFrom2FA() {
    await this.page.click(this.selectors.backButton)
  }
  
  /**
   * Check if login was successful
   */
  async isLoginSuccessful(): Promise<boolean> {
    try {
      await this.page.waitForURL('**/dashboard', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }
  
  /**
   * Get login error message
   */
  async getLoginError(): Promise<string | null> {
    if (await this.elementExists(this.selectors.errorMessage)) {
      return await this.getText(this.selectors.errorMessage)
    }
    return await this.getErrorMessage()
  }
  
  /**
   * Check if 2FA is required
   */
  async is2FARequired(): Promise<boolean> {
    return await this.elementExists(this.selectors.twoFactorInput)
  }
  
  /**
   * Check if user is already logged in
   */
  async isAlreadyLoggedIn(): Promise<boolean> {
    const currentUrl = this.getUrl()
    return currentUrl.includes('/dashboard') || 
           currentUrl.includes('/home') ||
           await this.hasText('Logout') ||
           await this.hasText('Sign out')
  }
  
  /**
   * Wait for login to complete
   */
  async waitForLoginComplete() {
    await Promise.race([
      this.page.waitForURL('**/dashboard', { timeout: 10000 }),
      this.page.waitForURL('**/home', { timeout: 10000 }),
      this.page.waitForSelector(this.selectors.errorMessage, { timeout: 10000 }),
      this.page.waitForSelector(this.selectors.twoFactorInput, { timeout: 10000 })
    ])
  }
  
  /**
   * Assert login page is displayed
   */
  async assertLoginPageDisplayed() {
    // Check if we're on the home page with sign-in options
    const emailSignInButtonVisible = await this.elementExists(this.selectors.emailSignInButton)
    const googleButtonVisible = await this.elementExists(this.selectors.googleButton)
    
    if (emailSignInButtonVisible || googleButtonVisible) {
      // We're on the initial sign-in page
      return
    }
    
    // Check if email form is visible
    await this.assertVisible(this.selectors.emailInput)
    await this.assertVisible(this.selectors.passwordInput)
    await this.assertVisible(this.selectors.submitButton)
  }
  
  /**
   * Assert login error is displayed
   */
  async assertLoginError(expectedError?: string) {
    await this.assertVisible(this.selectors.errorMessage)
    if (expectedError) {
      await this.assertText(this.selectors.errorMessage, expectedError)
    }
  }
  
  /**
   * Assert redirected to dashboard
   */
  async assertRedirectedToDashboard() {
    await this.assertURL(/.*\/(dashboard|home)/)
  }
  
  /**
   * Get form validation errors
   */
  async getValidationErrors(): Promise<Record<string, string>> {
    const errors: Record<string, string> = {}
    
    // Check email field error
    const emailError = await this.page.locator(`${this.selectors.emailInput} ~ .error-message`).textContent()
    if (emailError) errors.email = emailError
    
    // Check password field error
    const passwordError = await this.page.locator(`${this.selectors.passwordInput} ~ .error-message`).textContent()
    if (passwordError) errors.password = passwordError
    
    return errors
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
}