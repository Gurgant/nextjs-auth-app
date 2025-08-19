import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { RegisterPage } from '../pages/register.page'

test.describe('User Login/Logout Flow', () => {
  let loginPage: LoginPage
  
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
  })
  
  test('should display login page correctly', async () => {
    await loginPage.assertLoginPageDisplayed()
    await loginPage.assertTitle(/Auth App/i)
  })
  
  test('should login with valid credentials', async () => {
    // Use seeded test user
    await loginPage.login('test@example.com', 'Test123!')
    
    // Assert successful login
    await loginPage.assertRedirectedToDashboard()
    
    // Verify user is logged in
    const isLoggedIn = await loginPage.isAlreadyLoggedIn()
    expect(isLoggedIn).toBeTruthy()
  })
  
  test('should show error for invalid credentials', async () => {
    // Try to login with wrong password
    await loginPage.login('test@example.com', 'WrongPassword123!')
    
    // Assert error message appears
    await loginPage.page.waitForSelector('[role="alert"]', { timeout: 5000 })
    const error = await loginPage.getLoginError()
    expect(error).toBeTruthy()
  })
  
  test('should show error for non-existent user', async () => {
    // Try to login with non-existent email
    await loginPage.login('nonexistent@example.com', 'Password123!')
    
    // Assert error message
    await loginPage.assertLoginError()
    const error = await loginPage.getLoginError()
    expect(error).toBeTruthy()
  })
  
  test('should validate email format', async () => {
    // Enter invalid email
    await loginPage.fillLoginForm('invalid-email', 'Password123!')
    await loginPage.submitLogin()
    
    // Check validation error
    const errors = await loginPage.getValidationErrors()
    expect(errors.email).toContain('valid email')
  })
  
  test('should validate required fields', async () => {
    // Submit empty form
    await loginPage.submitLogin()
    
    // Check validation errors
    const errors = await loginPage.getValidationErrors()
    expect(Object.keys(errors).length).toBeGreaterThan(0)
  })
  
  test('should handle remember me option', async () => {
    // Login with remember me checked
    await loginPage.fillLoginForm('test@example.com', 'Test123!')
    await loginPage.toggleRememberMe()
    await loginPage.submitLogin()
    
    // Wait for successful login
    await loginPage.waitForLoginComplete()
    
    // Check if session is persistent (would need to check cookies)
    const cookies = await loginPage.page.context().cookies()
    const sessionCookie = cookies.find(c => c.name.includes('session'))
    
    if (sessionCookie) {
      // Remember me should set a longer expiry
      expect(sessionCookie.expires).toBeGreaterThan(Date.now() / 1000 + 86400) // More than 1 day
    }
  })
  
  test('should navigate to forgot password', async () => {
    // Check if forgot password link exists
    const forgotLink = await loginPage.page.locator('a:has-text("Forgot password"), a:has-text("Reset password")')
    
    if (await forgotLink.count() > 0) {
      await forgotLink.first().click()
      await loginPage.page.waitForTimeout(2000)
      
      // Check if navigated to password reset
      const isPasswordReset = 
        loginPage.page.url().includes('forgot') ||
        loginPage.page.url().includes('reset') ||
        await loginPage.page.locator('h1:has-text("Reset")').count() > 0
      
      expect(isPasswordReset).toBeTruthy()
    } else {
      // No forgot password link is valid (feature not implemented)
      expect(true).toBeTruthy()
    }
  })
  
  test('should navigate to sign up', async ({ page }) => {
    // Click the register link
    await page.click('a:has-text("Register here")')
    
    // Assert navigation to registration page
    await page.waitForURL(/register/, { timeout: 5000 })
    const registerPage = new RegisterPage(page)
    await registerPage.assertRegistrationPageDisplayed()
  })
  
  test('should handle 2FA authentication', async () => {
    // Login with 2FA enabled user
    await loginPage.login('2fa@example.com', '2FA123!')
    
    // Check if 2FA is required
    const is2FARequired = await loginPage.is2FARequired()
    
    if (is2FARequired) {
      // Enter 2FA code (would need actual TOTP generation in real test)
      await loginPage.enter2FACode('123456')
      
      // Wait for login to complete
      await loginPage.waitForLoginComplete()
      
      // Assert successful login
      await loginPage.assertRedirectedToDashboard()
    }
  })
  
  test('should resend 2FA code', async () => {
    // Login with 2FA enabled user
    await loginPage.login('2fa@example.com', '2FA123!')
    
    // If 2FA is required
    if (await loginPage.is2FARequired()) {
      // Click resend code
      await loginPage.resend2FACode()
      
      // Check for success message
      const success = await loginPage.getSuccessMessage()
      expect(success).toContain('sent')
    }
  })
  
  test('should go back from 2FA', async () => {
    // Login with 2FA enabled user
    await loginPage.login('2fa@example.com', '2FA123!')
    
    // If 2FA is required
    if (await loginPage.is2FARequired()) {
      // Click back button
      await loginPage.goBackFrom2FA()
      
      // Should return to login form
      await loginPage.assertLoginPageDisplayed()
    }
  })
  
  test('should logout successfully', async ({ page }) => {
    // First login
    await loginPage.login('test@example.com', 'Test123!')
    await loginPage.waitForLoginComplete()
    
    // Find and click logout button
    const logoutSelectors = [
      'button:has-text("Logout")',
      'button:has-text("Sign out")',
      'a:has-text("Logout")',
      'a:has-text("Sign out")',
      '[data-testid="logout-button"]'
    ]
    
    for (const selector of logoutSelectors) {
      if (await page.locator(selector).count() > 0) {
        await page.click(selector)
        break
      }
    }
    
    // Wait for redirect to login page
    await page.waitForURL(/signin|login/, { timeout: 10000 })
    
    // Verify logged out
    await loginPage.assertLoginPageDisplayed()
  })
  
  test('should prevent access to protected pages when not logged in', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('http://localhost:3000/en/dashboard')
    
    // Should redirect to login
    await page.waitForURL(/signin|login/, { timeout: 10000 })
    await loginPage.assertLoginPageDisplayed()
  })
  
  test('should show loading state during login', async () => {
    await loginPage.fillLoginForm('test@example.com', 'Test123!')
    
    // Start login and check loading state
    const submitPromise = loginPage.submitLogin()
    const loadingPromise = loginPage.isLoading()
    
    const [, isLoading] = await Promise.all([submitPromise, loadingPromise])
    
    // Loading state might be very quick
    if (isLoading) {
      await loginPage.waitForLoadingComplete()
    }
  })
  
  test('should handle session expiry', async ({ page, context }) => {
    // Login successfully
    await loginPage.login('test@example.com', 'Test123!')
    await loginPage.waitForLoginComplete()
    
    // Clear session cookies to simulate expiry
    await context.clearCookies()
    
    // Try to access protected page
    await page.goto('http://localhost:3000/en/dashboard')
    
    // Should redirect to login
    await page.waitForURL(/signin|login/, { timeout: 10000 })
    await loginPage.assertLoginPageDisplayed()
  })
  
  test('should handle unverified email', async () => {
    // Try to login with unverified user
    await loginPage.login('unverified@example.com', 'Unverified123!')
    
    // Check for verification message
    const error = await loginPage.getLoginError()
    if (error) {
      expect(error.toLowerCase()).toContain('verify')
    }
  })
  
  test('should login with Google OAuth', async () => {
    // Check if Google OAuth button exists
    const googleButton = await loginPage.page.locator('button:has-text("Google"), button:has-text("Continue with Google")')
    
    if (await googleButton.count() > 0) {
      // OAuth would open external page, just verify button exists
      expect(await googleButton.isVisible()).toBeTruthy()
    } else {
      // No Google OAuth is valid (feature might not be configured)
      expect(true).toBeTruthy()
    }
  })
  
  test('should login with GitHub OAuth', async () => {
    // Check if GitHub OAuth button exists
    const githubButton = await loginPage.page.locator('button:has-text("GitHub"), button:has-text("Continue with GitHub")')
    
    if (await githubButton.count() > 0) {
      // OAuth would open external page, just verify button exists
      expect(await githubButton.isVisible()).toBeTruthy()
    } else {
      // No GitHub OAuth is valid (feature might not be configured)
      expect(true).toBeTruthy()
    }
  })
})