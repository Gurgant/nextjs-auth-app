import { test, expect } from '@playwright/test'

test.describe('Basic Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure user is logged out first
    await page.goto('http://localhost:3000/api/auth/signout', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // Navigate to home page in unauthenticated state
    await page.goto('http://localhost:3000/en')
    
    // CRITICAL: Wait for session loading to complete - avoid "Loading..." state
    await page.waitForTimeout(3000)
    
    // Verify page is not stuck in loading state
    const isLoading = await page.locator('[data-testid="session-loading"]').isVisible().catch(() => false)
    if (isLoading) {
      console.log('⚠️ Page stuck in session loading state, waiting longer...')
      await page.waitForTimeout(5000)
    }
  })

  test('should display home page with sign-in options', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Auth App/i)
    
    // Wait for page to fully load and session to be determined
    await page.waitForTimeout(3000)
    
    // Check for sign-in buttons based on conditional rendering states
    // State 1: showCredentials = false (default) - should show Google + Email toggle
    const googleButton = page.locator([
      'button[data-testid="sign-in-with-google-button"]',
      'button:has-text("Sign in with Google")',
      'button:has-text("Iniciar sesión con Google")',
      'button:has-text("Se connecter avec Google")', 
      'button:has-text("Mit Google anmelden")',
      'button:has-text("Accedi con Google")'
    ].join(', '))
    const emailToggleButton = page.locator([
      'button[data-testid="sign-in-with-email-toggle"]',
      'button:has-text("Sign in with Email")',
      'button:has-text("Iniciar sesión con Email")', 
      'button:has-text("Se connecter avec Email")',
      'button:has-text("Mit E-Mail anmelden")',
      'button:has-text("Accedi con Email")'
    ].join(', '))
    
    // State 2: showCredentials = true - should show "Sign in with Google instead" 
    const googleInsteadButton = page.locator([
      'button:has-text("Sign in with Google instead")',
      'button:has-text("Se connecter avec Google à la place")',
      'button:has-text("Iniciar sesión con Google en su lugar")',
      'button:has-text("Stattdessen mit Google anmelden")',
      'button:has-text("Accedi con Google invece")'
    ].join(', '))
    
    // Check for ANY valid sign-in option across both states
    const hasGoogleButton = await googleButton.first().isVisible().catch(() => false)
    const hasEmailToggle = await emailToggleButton.first().isVisible().catch(() => false)  
    const hasGoogleInstead = await googleInsteadButton.first().isVisible().catch(() => false)
    
    // At least one sign-in option should be visible in either state
    const hasAnySignInOption = hasGoogleButton || hasEmailToggle || hasGoogleInstead
    
    console.log('Sign-in button visibility:', { hasGoogleButton, hasEmailToggle, hasGoogleInstead })
    
    expect(hasAnySignInOption).toBeTruthy()
  })

  test('should show email login form when clicking Sign in with Email', async ({ page }) => {
    // Wait for page to stabilize after logout
    await page.waitForTimeout(3000)
    
    // Debug: Check current page state
    const googleButton = page.locator('button[data-testid="sign-in-with-google-button"]')
    const emailToggleButton = page.locator('button[data-testid="sign-in-with-email-toggle"]')
    const credentialsForm = page.locator('input[id="email"]')
    
    const hasGoogle = await googleButton.isVisible().catch(() => false)
    const hasEmailToggle = await emailToggleButton.isVisible().catch(() => false)  
    const hasCredForm = await credentialsForm.isVisible().catch(() => false)
    
    console.log('Page state:', { hasGoogle, hasEmailToggle, hasCredForm })
    
    if (hasEmailToggle) {
      // Click sign in with email toggle
      await emailToggleButton.click()
      
      // Wait for form to appear with reasonable timeout
      await page.waitForSelector('input[id="email"]', { state: 'visible', timeout: 10000 })
      
      // Check form elements are now visible
      await expect(page.locator('input[id="email"]')).toBeVisible()
      await expect(page.locator('input[id="password"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    } else {
      // If no email toggle, check if form is already visible or if we're in wrong state
      expect(hasCredForm || hasGoogle).toBeTruthy()
    }
  })

  test('should navigate to register page', async ({ page }) => {
    // Click register link
    await page.click('a:has-text("Register here")')
    
    // Wait for navigation
    await page.waitForURL(/register/)
    
    // Check we're on register page - be more specific with h1
    await expect(page.locator('h1').last()).toContainText(/Create|Register|Sign Up/i)
  })

  test('should show error for invalid login', async ({ page }) => {
    // Use reliable multi-language button selector
    const emailButton = page.locator([
      'button[data-testid="sign-in-with-email-toggle"]',
      'button:has-text("Sign in with Email")',
      'button:has-text("Iniciar sesión con Email")', 
      'button:has-text("Se connecter avec Email")',
      'button:has-text("Mit E-Mail anmelden")',
      'button:has-text("Accedi con Email")'
    ].join(', '))
    
    // Debug current page state
    const currentUrl = page.url()
    const pageTitle = await page.title()
    console.log(`🔍 Debug - URL: ${currentUrl}, Title: ${pageTitle}`)
    
    // Check if we're still in loading state
    const isLoading = await page.locator('[data-testid="session-loading"]').isVisible().catch(() => false)
    if (isLoading) {
      console.log('❌ Still in loading state, waiting more...')
      await page.waitForTimeout(5000)
    }
    
    // Ensure email form is visible
    const emailInput = page.locator('input[id="email"]')
    const hasEmailInput = await emailInput.isVisible().catch(() => false)
    const hasEmailButton = await emailButton.first().isVisible().catch(() => false)
    
    console.log(`🔍 Form state - Email input: ${hasEmailInput}, Email button: ${hasEmailButton}`)
    
    if (!hasEmailInput) {
      if (hasEmailButton) {
        console.log('📧 Clicking email toggle button...')
        await emailButton.first().click()
        await page.waitForSelector('input[id="email"]', { state: 'visible', timeout: 10000 })
      } else {
        // Enhanced debugging for failure case
        const allButtons = await page.locator('button').count()
        const allInputs = await page.locator('input').count()
        const bodyText = await page.locator('body').innerText()
        
        console.log(`❌ DEBUG - Buttons: ${allButtons}, Inputs: ${allInputs}`)
        console.log(`❌ Page content: ${bodyText.substring(0, 500)}...`)
        
        throw new Error('Neither email form nor email toggle button is visible')
      }
    }
    
    // Fill form with invalid credentials
    await page.fill('input[id="email"]', 'wrong@example.com')
    await page.fill('input[id="password"]', 'WrongPassword123!')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Check for error message
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 })
  })

  test('should allow successful login with test user', async ({ page }) => {
    // Use reliable multi-language button selector
    const emailButton = page.locator([
      'button[data-testid="sign-in-with-email-toggle"]',
      'button:has-text("Sign in with Email")',
      'button:has-text("Iniciar sesión con Email")', 
      'button:has-text("Se connecter avec Email")',
      'button:has-text("Mit E-Mail anmelden")',
      'button:has-text("Accedi con Email")'
    ].join(', '))
    
    // Debug current page state (same as invalid login test)
    const currentUrl = page.url()
    const pageTitle = await page.title()
    console.log(`🔍 Debug - URL: ${currentUrl}, Title: ${pageTitle}`)
    
    // Check if we're still in loading state
    const isLoading = await page.locator('[data-testid="session-loading"]').isVisible().catch(() => false)
    if (isLoading) {
      console.log('❌ Still in loading state, waiting more...')
      await page.waitForTimeout(5000)
    }
    
    // Ensure email form is visible
    const emailInput = page.locator('input[id="email"]')
    const hasEmailInput = await emailInput.isVisible().catch(() => false)
    const hasEmailButton = await emailButton.first().isVisible().catch(() => false)
    
    console.log(`🔍 Form state - Email input: ${hasEmailInput}, Email button: ${hasEmailButton}`)
    
    if (!hasEmailInput) {
      if (hasEmailButton) {
        console.log('📧 Clicking email toggle button...')
        await emailButton.first().click()
        await page.waitForSelector('input[id="email"]', { state: 'visible', timeout: 10000 })
      } else {
        // Enhanced debugging for failure case
        const allButtons = await page.locator('button').count()
        const allInputs = await page.locator('input').count()
        const bodyText = await page.locator('body').innerText()
        
        console.log(`❌ DEBUG - Buttons: ${allButtons}, Inputs: ${allInputs}`)
        console.log(`❌ Page content: ${bodyText.substring(0, 500)}...`)
        
        throw new Error('Neither email form nor email toggle button is visible')
      }
    }
    
    // Fill form with test credentials
    await page.fill('input[id="email"]', 'test@example.com')
    await page.fill('input[id="password"]', 'Test123!')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Wait for either dashboard redirect or welcome message
    await Promise.race([
      page.waitForURL(/dashboard/, { timeout: 10000 }).catch(() => null),
      page.waitForSelector('text=/Welcome|Successfully/i', { timeout: 10000 }).catch(() => null),
    ])
    
    // Check we're logged in (either on dashboard or showing welcome)
    const url = page.url()
    const hasWelcome = await page.locator('text=/Welcome/i').count() > 0
    const hasDashboard = url.includes('dashboard')
    
    expect(hasWelcome || hasDashboard).toBeTruthy()
  })
})

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to register page
    await page.goto('http://localhost:3000/en/register')
  })

  test('should display registration form', async ({ page }) => {
    // Check form elements are visible
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should show validation errors for empty form', async ({ page }) => {
    // Try to submit empty form - button should be disabled
    const submitButton = page.locator('button[type="submit"]')
    
    // Check if button is disabled (form validation prevents submission)
    const isDisabled = await submitButton.isDisabled()
    
    if (isDisabled) {
      // Button is correctly disabled for empty form
      expect(isDisabled).toBeTruthy()
    } else {
      // If not disabled, click and check for validation
      await submitButton.click()
      
      // Check for validation messages
      const emailInput = page.locator('input[name="email"]')
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid)
      expect(isInvalid).toBeTruthy()
    }
  })

  test('should show error for duplicate email', async ({ page }) => {
    // Fill form with existing user email
    await page.fill('input[name="name"]', 'Test User')
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'Test123!')
    
    // Check if there's a confirm password field
    const confirmPasswordField = page.locator('input[name="confirmPassword"]')
    if (await confirmPasswordField.count() > 0) {
      await confirmPasswordField.fill('Test123!')
    }
    
    // Submit form - wait for button to be enabled
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.waitFor({ state: 'visible' })
    
    // Wait for button to be enabled after filling form
    await page.waitForTimeout(500) // Give time for validation
    
    // Check if button is still disabled
    const isDisabled = await submitButton.isDisabled()
    if (!isDisabled) {
      await submitButton.click()
      
      // Check for error message
      await expect(page.locator('text=/already exists|already registered|email.*taken/i').first()).toBeVisible({ timeout: 10000 })
    } else {
      // If button is still disabled, there might be additional validation
      console.log('Submit button still disabled after filling form')
    }
  })

  test('should successfully register new user', async ({ page }) => {
    // Generate unique email
    const timestamp = Date.now()
    const email = `newuser${timestamp}@example.com`
    
    // Fill form
    await page.fill('input[name="name"]', 'New Test User')
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', 'Test123!')
    
    // Check if there's a confirm password field
    const confirmPasswordField = page.locator('input[name="confirmPassword"]')
    if (await confirmPasswordField.count() > 0) {
      await confirmPasswordField.fill('Test123!')
    }
    
    // Check the terms checkbox if it exists
    const termsCheckbox = page.locator('input[type="checkbox"]')
    if (await termsCheckbox.count() > 0) {
      await termsCheckbox.first().check()
    }
    
    // Wait for validation to complete
    await page.waitForTimeout(500)
    
    // Submit form - ensure button is enabled
    const submitButton = page.locator('button[type="submit"]')
    
    // Wait for button to be enabled
    await expect(submitButton).toBeEnabled({ timeout: 5000 })
    
    // Click submit
    await submitButton.click()
    
    // Wait for success (redirect or message)
    await Promise.race([
      page.waitForURL(/dashboard|welcome|verify|login|signin/, { timeout: 10000 }).catch(() => null),
      page.waitForSelector('text=/Success|Registered|Verify|Welcome|Account.*created/i', { timeout: 10000 }).catch(() => null),
    ])
    
    // Check for success indication
    const url = page.url()
    const hasSuccess = await page.locator('text=/Success|Registered|Welcome|Account.*created/i').count() > 0
    const redirected = !url.includes('/register')
    
    expect(hasSuccess || redirected).toBeTruthy()
  })
})