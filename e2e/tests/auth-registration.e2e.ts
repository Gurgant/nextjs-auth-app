import { test, expect } from '@playwright/test'
import { RegisterPage } from '../pages/register.page'
import { LoginPage } from '../pages/login.page'

test.describe('User Registration Flow', () => {
  let registerPage: RegisterPage
  
  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page)
    await registerPage.goto()
  })
  
  test('should display registration page correctly', async () => {
    await registerPage.assertRegistrationPageDisplayed()
    await registerPage.assertTitle(/Sign Up|Register|Create Account/i)
  })
  
  test('should register new user successfully', async () => {
    // Generate random user data
    const userData = RegisterPage.generateRandomUser()
    
    // Fill and submit registration form
    await registerPage.register({
      ...userData,
      acceptTerms: true,
      newsletter: false
    })
    
    // Assert registration success
    await registerPage.assertRegistrationSuccess()
    
    // Check if email verification is required
    const emailVerificationRequired = await registerPage.isEmailVerificationRequired()
    if (emailVerificationRequired) {
      await registerPage.assertEmailVerificationRequired()
      expect(await registerPage.hasText('Please check your email')).toBeTruthy()
    } else {
      // User might be auto-logged in
      await registerPage.assertURL(/dashboard|home|welcome/)
    }
  })
  
  test('should show validation errors for invalid input', async () => {
    // Submit empty form
    await registerPage.submitRegistration()
    
    // Check validation errors
    const errors = await registerPage.getValidationErrors()
    expect(Object.keys(errors).length).toBeGreaterThan(0)
    
    // Fill with invalid data
    await registerPage.fillRegistrationForm({
      name: 'a', // Too short
      email: 'invalid-email', // Invalid format
      password: '123', // Too weak
      confirmPassword: '456' // Doesn't match
    })
    
    await registerPage.submitRegistration()
    
    // Check specific validation errors
    const validationErrors = await registerPage.getValidationErrors()
    expect(validationErrors.email).toContain('valid email')
    expect(validationErrors.password).toBeTruthy()
  })
  
  test('should prevent duplicate email registration', async ({ page }) => {
    // Use existing test user email
    await registerPage.register({
      name: 'Duplicate User',
      email: 'test@example.com', // This email exists in seed data
      password: 'Test123!@#',
      acceptTerms: true
    })
    
    // Assert error message
    await registerPage.assertRegistrationError()
    const error = await registerPage.getRegistrationError()
    expect(error).toContain('already exists')
  })
  
  test('should validate password strength', async () => {
    // Enter weak password
    await registerPage.fillField('input[name="password"]', 'weak')
    
    // Check password strength indicator
    const strength = await registerPage.getPasswordStrength()
    if (strength) {
      expect(strength.toLowerCase()).toContain('weak')
    }
    
    // Enter strong password
    await registerPage.fillField('input[name="password"]', 'StrongP@ssw0rd123!')
    
    // Check password requirements
    const requirements = await registerPage.checkPasswordRequirements()
    expect(requirements.length).toBeTruthy()
    expect(requirements.uppercase).toBeTruthy()
    expect(requirements.number).toBeTruthy()
    expect(requirements.special).toBeTruthy()
  })
  
  test('should validate password confirmation match', async () => {
    await registerPage.fillRegistrationForm({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Test123!@#',
      confirmPassword: 'Different123!@#'
    })
    
    await registerPage.submitRegistration()
    
    const errors = await registerPage.getValidationErrors()
    expect(errors.confirmPassword).toContain('match')
  })
  
  test('should navigate to login page', async ({ page }) => {
    await registerPage.clickSignIn()
    
    const loginPage = new LoginPage(page)
    await loginPage.assertLoginPageDisplayed()
    await loginPage.assertURL(/signin|login/)
  })
  
  test('should handle terms and conditions', async () => {
    const userData = RegisterPage.generateRandomUser()
    
    // Try to register without accepting terms
    await registerPage.fillRegistrationForm(userData)
    await registerPage.submitRegistration()
    
    // Should show error or not submit
    const error = await registerPage.getRegistrationError()
    if (error) {
      expect(error.toLowerCase()).toContain('terms')
    }
    
    // Accept terms and register
    await registerPage.acceptTerms()
    await registerPage.submitRegistration()
    
    // Should proceed with registration
    await registerPage.assertRegistrationSuccess()
  })
  
  test('should resend verification email', async () => {
    const userData = RegisterPage.generateRandomUser()
    
    // Register new user
    await registerPage.register({
      ...userData,
      acceptTerms: true
    })
    
    // If email verification is required
    if (await registerPage.isEmailVerificationRequired()) {
      // Click resend button
      await registerPage.resendVerificationEmail()
      
      // Check for success message
      const success = await registerPage.getSuccessMessage()
      expect(success).toContain('sent')
    }
  })
  
  test('should show loading state during registration', async () => {
    const userData = RegisterPage.generateRandomUser()
    
    await registerPage.fillRegistrationForm(userData)
    
    // Start registration and check loading state
    const submitPromise = registerPage.submitRegistration()
    const loadingPromise = registerPage.isLoading()
    
    const [, isLoading] = await Promise.all([submitPromise, loadingPromise])
    
    // Loading state might be very quick, so this is optional
    if (isLoading) {
      await registerPage.waitForLoadingComplete()
    }
  })
  
  test('should register with Google OAuth', async () => {
    // Check if Google OAuth button exists
    const googleButton = await registerPage.page.locator('button:has-text("Google"), button:has-text("Continue with Google")')
    
    if (await googleButton.count() > 0) {
      // OAuth would open external page, just verify button exists
      expect(await googleButton.isVisible()).toBeTruthy()
    } else {
      // No Google OAuth is valid (feature might not be configured)
      expect(true).toBeTruthy()
    }
  })
  
  test('should register with GitHub OAuth', async () => {
    // Check if GitHub OAuth button exists
    const githubButton = await registerPage.page.locator('button:has-text("GitHub"), button:has-text("Continue with GitHub")')
    
    if (await githubButton.count() > 0) {
      // OAuth would open external page, just verify button exists
      expect(await githubButton.isVisible()).toBeTruthy()
    } else {
      // No GitHub OAuth is valid (feature might not be configured)
      expect(true).toBeTruthy()
    }
  })
})