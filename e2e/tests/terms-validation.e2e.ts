import { test, expect } from '@playwright/test'
import { RegisterPage } from '../pages/register.page'

test.describe('Terms Checkbox Validation', () => {
  let registerPage: RegisterPage
  
  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page)
    await registerPage.goto()
  })
  
  test('should keep submit button disabled without terms acceptance', async ({ page }) => {
    // Fill all required fields EXCEPT terms checkbox
    await registerPage.fillRegistrationForm({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Test123!',
      confirmPassword: 'Test123!'
    })
    
    // DO NOT check the terms checkbox
    
    // Verify submit button is disabled
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeDisabled()
    
    // Now check the terms checkbox
    await page.check('input[name="terms"]')
    
    // Verify submit button is now enabled
    await expect(submitButton).toBeEnabled()
  })
  
  test('should successfully register when terms are accepted', async ({ page }) => {
    const userData = RegisterPage.generateRandomUser()
    
    // Register WITH terms acceptance
    await registerPage.register({
      ...userData,
      acceptTerms: true  // This is REQUIRED
    })
    
    // Should succeed
    const isSuccess = await registerPage.isRegistrationSuccessful()
    expect(isSuccess).toBeTruthy()
  })
  
  test('should not allow registration without terms', async ({ page }) => {
    const userData = RegisterPage.generateRandomUser()
    
    // Try to register WITHOUT terms
    await registerPage.fillRegistrationForm(userData)
    // Don't check terms checkbox
    
    // Try to submit
    const submitButton = page.locator('button[type="submit"]')
    
    // Button should be disabled
    await expect(submitButton).toBeDisabled()
    
    // Should not navigate away
    await expect(page).toHaveURL(/register/)
  })
})