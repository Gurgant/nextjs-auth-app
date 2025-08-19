import { Page } from '@playwright/test'
import { BasePage } from './base.page'

/**
 * Dashboard Page Object
 * Handles all interactions with the user dashboard
 */
export class DashboardPage extends BasePage {
  // Selectors
  private readonly selectors = {
    // Navigation
    navBar: 'nav',
    homeLink: 'a[href*="/dashboard"]',
    settingsLink: 'a[href*="/settings"]',
    profileLink: 'a[href*="/profile"]',
    logoutButton: '[data-testid="logout-button"], button:has-text("Sign out"), button:has-text("Logout")',
    
    // User info
    userAvatar: '[data-testid="user-avatar"]',
    userName: '[data-testid="user-name"]',
    userEmail: '[data-testid="user-email"]',
    welcomeMessage: 'h1, h2',
    
    // Dashboard content
    statsCard: '[data-testid="stats-card"]',
    activityFeed: '[data-testid="activity-feed"]',
    quickActions: '[data-testid="quick-actions"]',
    
    // Common elements
    pageTitle: 'h1',
    breadcrumb: '[data-testid="breadcrumb"]',
    notification: '[role="alert"]',
    loadingSpinner: '[data-testid="loading-spinner"]',
  }
  
  constructor(page: Page) {
    super(page)
  }
  
  /**
   * Navigate to dashboard
   */
  async goto() {
    await super.goto('/en/dashboard')
    await this.waitForPageLoad()
  }
  
  /**
   * Check if user is on dashboard
   */
  async isDashboardDisplayed(): Promise<boolean> {
    const url = this.page.url()
    return url.includes('dashboard')
  }
  
  /**
   * Get welcome message text
   */
  async getWelcomeMessage(): Promise<string | null> {
    const welcome = await this.page.locator(this.selectors.welcomeMessage).first()
    if (await welcome.count() > 0) {
      return await welcome.textContent()
    }
    return null
  }
  
  /**
   * Get user display name
   */
  async getUserDisplayName(): Promise<string | null> {
    // Try multiple possible selectors
    const selectors = [
      this.selectors.userName,
      'text=/Welcome.*[A-Za-z]+/',
      '[data-testid="user-info"]'
    ]
    
    for (const selector of selectors) {
      const element = this.page.locator(selector)
      if (await element.count() > 0) {
        const text = await element.textContent()
        if (text) return text.trim()
      }
    }
    
    return null
  }
  
  /**
   * Navigate to settings
   */
  async goToSettings() {
    await this.page.click(this.selectors.settingsLink)
    await this.waitForNavigation()
  }
  
  /**
   * Navigate to profile
   */
  async goToProfile() {
    await this.page.click(this.selectors.profileLink)
    await this.waitForNavigation()
  }
  
  /**
   * Logout from dashboard
   */
  async logout() {
    // Try multiple logout button selectors
    const logoutSelectors = [
      this.selectors.logoutButton,
      'button:has-text("Sign out")',
      'button:has-text("Logout")',
      'a:has-text("Sign out")',
      'a:has-text("Logout")'
    ]
    
    let clicked = false
    for (const selector of logoutSelectors) {
      if (await this.page.locator(selector).count() > 0) {
        await this.page.click(selector)
        clicked = true
        break
      }
    }
    
    if (!clicked) {
      throw new Error('Could not find logout button')
    }
    
    // Wait for redirect to login page
    await this.page.waitForURL(/signin|login|^\/[a-z]{2}$/, { timeout: 10000 })
  }
  
  /**
   * Check if user has admin privileges
   */
  async hasAdminAccess(): Promise<boolean> {
    // Check for admin-only elements
    const adminSelectors = [
      '[data-testid="admin-panel"]',
      'a[href*="/admin"]',
      'button:has-text("Admin")',
      '[role="navigation"] >> text=Admin'
    ]
    
    for (const selector of adminSelectors) {
      if (await this.page.locator(selector).count() > 0) {
        return true
      }
    }
    
    return false
  }
  
  /**
   * Get dashboard stats
   */
  async getDashboardStats(): Promise<Record<string, string>> {
    const stats: Record<string, string> = {}
    
    const statsCards = await this.page.locator(this.selectors.statsCard).all()
    for (const card of statsCards) {
      const label = await card.locator('[data-testid="stat-label"]').textContent()
      const value = await card.locator('[data-testid="stat-value"]').textContent()
      
      if (label && value) {
        stats[label.trim()] = value.trim()
      }
    }
    
    return stats
  }
  
  /**
   * Check for notifications
   */
  async hasNotifications(): Promise<boolean> {
    return await this.elementExists(this.selectors.notification)
  }
  
  /**
   * Get notification message
   */
  async getNotificationMessage(): Promise<string | null> {
    if (await this.hasNotifications()) {
      return await this.getText(this.selectors.notification)
    }
    return null
  }
  
  /**
   * Assert dashboard is accessible
   */
  async assertDashboardAccessible() {
    const isDashboard = await this.isDashboardDisplayed()
    if (!isDashboard) {
      throw new Error('Dashboard is not accessible')
    }
    
    // Check for key dashboard elements
    const hasContent = await this.page.locator('main').count() > 0
    if (!hasContent) {
      throw new Error('Dashboard content not loaded')
    }
  }
  
  /**
   * Assert user is logged in
   */
  async assertUserLoggedIn(expectedName?: string) {
    const userName = await this.getUserDisplayName()
    if (!userName) {
      throw new Error('User name not displayed')
    }
    
    if (expectedName && !userName.includes(expectedName)) {
      throw new Error(`Expected user ${expectedName}, but got ${userName}`)
    }
  }
  
  /**
   * Wait for dashboard to load
   */
  async waitForDashboardLoad() {
    await this.waitForPageLoad()
    
    // Wait for key elements
    await Promise.race([
      this.page.waitForSelector(this.selectors.welcomeMessage, { timeout: 5000 }).catch(() => null),
      this.page.waitForSelector(this.selectors.userName, { timeout: 5000 }).catch(() => null),
      this.page.waitForSelector('text=Dashboard', { timeout: 5000 }).catch(() => null),
    ])
  }
  
  /**
   * Refresh dashboard
   */
  async refreshDashboard() {
    await this.page.reload()
    await this.waitForDashboardLoad()
  }
  
  /**
   * Check session validity
   */
  async isSessionValid(): Promise<boolean> {
    // Refresh page and check if still on dashboard
    await this.refreshDashboard()
    return await this.isDashboardDisplayed()
  }
}