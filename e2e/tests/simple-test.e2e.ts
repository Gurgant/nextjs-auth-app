import { test, expect } from '@playwright/test'

test.describe('Simple Application Test', () => {
  test('should load home page', async ({ page }) => {
    console.log('Navigating to home page...')
    await page.goto('/en', { waitUntil: 'domcontentloaded', timeout: 10000 })
    
    console.log('Waiting for page to load...')
    await page.waitForTimeout(2000)
    
    console.log('Current URL:', page.url())
    
    // Check if basic elements exist
    const title = await page.title()
    console.log('Page title:', title)
    
    expect(page.url()).toContain('/en')
    expect(title).toMatch(/Auth App/i)
  })
})