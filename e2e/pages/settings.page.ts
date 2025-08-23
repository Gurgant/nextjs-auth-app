import { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Settings Page Object
 * Handles all interactions with user settings and preferences
 */
export class SettingsPage extends BasePage {
  // Selectors organized by section
  private readonly selectors = {
    // Page elements
    pageTitle: 'h1:has-text("Settings")',
    breadcrumb: 'nav[aria-label="breadcrumb"]',

    // Profile section
    profile: {
      section: '[data-testid="profile-section"]',
      nameInput: 'input[name="name"]',
      emailInput: 'input[name="email"]',
      bioTextarea: 'textarea[name="bio"]',
      avatarUpload: 'input[type="file"][name="avatar"]',
      avatarPreview: '[data-testid="avatar-preview"]',
      updateButton: 'button:has-text("Update Profile")',
      successMessage: '[data-testid="profile-success"]',
      errorMessage: '[data-testid="profile-error"]',
    },

    // Security section
    security: {
      section: '[data-testid="security-section"]',
      currentPasswordInput: 'input[name="currentPassword"]',
      newPasswordInput: 'input[name="newPassword"]',
      confirmPasswordInput: 'input[name="confirmPassword"]',
      changePasswordButton: 'button:has-text("Change Password")',
      twoFactorToggle: 'input[name="twoFactorEnabled"]',
      twoFactorSetupButton: 'button:has-text("Setup 2FA")',
      qrCode: '[data-testid="2fa-qr-code"]',
      totpInput: 'input[name="totpCode"]',
      verifyTotpButton: 'button:has-text("Verify")',
      sessionsList: '[data-testid="active-sessions"]',
      revokeSessionButton: 'button:has-text("Revoke")',
      revokeAllButton: 'button:has-text("Revoke All Sessions")',
    },

    // Preferences section
    preferences: {
      section: '[data-testid="preferences-section"]',
      languageSelect: 'select[name="language"]',
      timezoneSelect: 'select[name="timezone"]',
      themeToggle: 'input[name="darkMode"]',
      notificationsToggle: 'input[name="notifications"]',
      emailNotificationsToggle: 'input[name="emailNotifications"]',
      marketingToggle: 'input[name="marketingEmails"]',
      savePreferencesButton: 'button:has-text("Save Preferences")',
    },

    // Privacy section
    privacy: {
      section: '[data-testid="privacy-section"]',
      publicProfileToggle: 'input[name="publicProfile"]',
      showEmailToggle: 'input[name="showEmail"]',
      dataExportButton: 'button:has-text("Export My Data")',
      deleteAccountButton: 'button:has-text("Delete Account")',
      confirmDeleteInput: 'input[name="confirmDelete"]',
      confirmDeleteButton: 'button:has-text("Permanently Delete")',
    },

    // Common elements
    saveButton: 'button:has-text("Save")',
    cancelButton: 'button:has-text("Cancel")',
    backButton: 'button:has-text("Back")',
    modal: '[role="dialog"]',
    modalConfirm: '[role="dialog"] button:has-text("Confirm")',
    modalCancel: '[role="dialog"] button:has-text("Cancel")',
    toast: '[role="alert"]',
    loadingSpinner: '[data-testid="loading"]',
    validationError: ".error-message",
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to settings page
   */
  async goto() {
    await super.goto("/en/settings");
    await this.waitForPageLoad();
  }

  // ========== Profile Management ==========

  /**
   * Update user profile
   */
  async updateProfile(data: { name?: string; email?: string; bio?: string }) {
    if (data.name) {
      await this.fillField(this.selectors.profile.nameInput, data.name);
    }
    if (data.email) {
      await this.fillField(this.selectors.profile.emailInput, data.email);
    }
    if (data.bio) {
      await this.fillField(this.selectors.profile.bioTextarea, data.bio);
    }

    await this.page.click(this.selectors.profile.updateButton);

    // Wait for response
    await this.page.waitForSelector(
      [
        this.selectors.profile.successMessage,
        this.selectors.profile.errorMessage,
      ].join(", "),
      { timeout: 5000 },
    );
  }

  /**
   * Upload avatar image
   */
  async uploadAvatar(filePath: string) {
    await this.page.setInputFiles(
      this.selectors.profile.avatarUpload,
      filePath,
    );

    // Wait for preview to update
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get profile update result
   */
  async getProfileUpdateResult(): Promise<{
    success: boolean;
    message?: string;
  }> {
    const success = await this.elementExists(
      this.selectors.profile.successMessage,
    );

    if (success) {
      const message = await this.getText(this.selectors.profile.successMessage);
      return { success: true, message };
    }

    const error = await this.getText(this.selectors.profile.errorMessage);
    return { success: false, message: error };
  }

  // ========== Security Management ==========

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string) {
    await this.fillField(
      this.selectors.security.currentPasswordInput,
      currentPassword,
    );
    await this.fillField(this.selectors.security.newPasswordInput, newPassword);
    await this.fillField(
      this.selectors.security.confirmPasswordInput,
      newPassword,
    );

    await this.page.click(this.selectors.security.changePasswordButton);

    // Wait for response
    await this.page.waitForSelector(this.selectors.toast, { timeout: 5000 });
  }

  /**
   * Enable/disable two-factor authentication
   */
  async toggleTwoFactor(enable: boolean) {
    const isEnabled = await this.page.isChecked(
      this.selectors.security.twoFactorToggle,
    );

    if (isEnabled !== enable) {
      await this.page.click(this.selectors.security.twoFactorToggle);

      if (enable) {
        // Wait for QR code
        await this.page.waitForSelector(this.selectors.security.qrCode, {
          timeout: 5000,
        });
      }
    }
  }

  /**
   * Setup 2FA with TOTP
   */
  async setup2FA(totpCode: string) {
    await this.page.click(this.selectors.security.twoFactorSetupButton);

    // Wait for QR code
    await this.page.waitForSelector(this.selectors.security.qrCode);

    // Enter TOTP code
    await this.fillField(this.selectors.security.totpInput, totpCode);
    await this.page.click(this.selectors.security.verifyTotpButton);

    // Wait for confirmation
    await this.page.waitForSelector(this.selectors.toast, { timeout: 5000 });
  }

  /**
   * Revoke all sessions except current
   */
  async revokeAllSessions() {
    await this.page.click(this.selectors.security.revokeAllButton);

    // Confirm in modal
    await this.page.waitForSelector(this.selectors.modal);
    await this.page.click(this.selectors.modalConfirm);

    // Wait for confirmation
    await this.page.waitForSelector(this.selectors.toast, { timeout: 5000 });
  }

  /**
   * Get active sessions count
   */
  async getActiveSessionsCount(): Promise<number> {
    const sessions = await this.page
      .locator(`${this.selectors.security.sessionsList} li`)
      .count();
    return sessions;
  }

  // ========== Preferences Management ==========

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: {
    language?: string;
    timezone?: string;
    darkMode?: boolean;
    notifications?: boolean;
    emailNotifications?: boolean;
    marketingEmails?: boolean;
  }) {
    if (preferences.language) {
      await this.page.selectOption(
        this.selectors.preferences.languageSelect,
        preferences.language,
      );
    }

    if (preferences.timezone) {
      await this.page.selectOption(
        this.selectors.preferences.timezoneSelect,
        preferences.timezone,
      );
    }

    if (preferences.darkMode !== undefined) {
      const isDark = await this.page.isChecked(
        this.selectors.preferences.themeToggle,
      );
      if (isDark !== preferences.darkMode) {
        await this.page.click(this.selectors.preferences.themeToggle);
      }
    }

    if (preferences.notifications !== undefined) {
      const isEnabled = await this.page.isChecked(
        this.selectors.preferences.notificationsToggle,
      );
      if (isEnabled !== preferences.notifications) {
        await this.page.click(this.selectors.preferences.notificationsToggle);
      }
    }

    if (preferences.emailNotifications !== undefined) {
      const isEnabled = await this.page.isChecked(
        this.selectors.preferences.emailNotificationsToggle,
      );
      if (isEnabled !== preferences.emailNotifications) {
        await this.page.click(
          this.selectors.preferences.emailNotificationsToggle,
        );
      }
    }

    if (preferences.marketingEmails !== undefined) {
      const isEnabled = await this.page.isChecked(
        this.selectors.preferences.marketingToggle,
      );
      if (isEnabled !== preferences.marketingEmails) {
        await this.page.click(this.selectors.preferences.marketingToggle);
      }
    }

    await this.page.click(this.selectors.preferences.savePreferencesButton);

    // Wait for save confirmation
    await this.page.waitForSelector(this.selectors.toast, { timeout: 5000 });
  }

  /**
   * Get current theme
   */
  async getCurrentTheme(): Promise<"light" | "dark"> {
    const isDark = await this.page.isChecked(
      this.selectors.preferences.themeToggle,
    );
    return isDark ? "dark" : "light";
  }

  // ========== Privacy Management ==========

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(settings: {
    publicProfile?: boolean;
    showEmail?: boolean;
  }) {
    if (settings.publicProfile !== undefined) {
      const isPublic = await this.page.isChecked(
        this.selectors.privacy.publicProfileToggle,
      );
      if (isPublic !== settings.publicProfile) {
        await this.page.click(this.selectors.privacy.publicProfileToggle);
      }
    }

    if (settings.showEmail !== undefined) {
      const showEmail = await this.page.isChecked(
        this.selectors.privacy.showEmailToggle,
      );
      if (showEmail !== settings.showEmail) {
        await this.page.click(this.selectors.privacy.showEmailToggle);
      }
    }

    await this.page.click(this.selectors.saveButton);

    // Wait for save confirmation
    await this.page.waitForSelector(this.selectors.toast, { timeout: 5000 });
  }

  /**
   * Export user data
   */
  async exportUserData() {
    // Start download promise before clicking
    const downloadPromise = this.page.waitForEvent("download");

    await this.page.click(this.selectors.privacy.dataExportButton);

    const download = await downloadPromise;
    return download;
  }

  /**
   * Delete user account
   */
  async deleteAccount(confirmText: string = "DELETE") {
    await this.page.click(this.selectors.privacy.deleteAccountButton);

    // Wait for confirmation modal
    await this.page.waitForSelector(this.selectors.modal);

    // Type confirmation
    await this.fillField(
      this.selectors.privacy.confirmDeleteInput,
      confirmText,
    );

    // Click delete
    await this.page.click(this.selectors.privacy.confirmDeleteButton);

    // Wait for redirect (account deleted)
    await this.page.waitForURL(/\/(en|login|signin)/, { timeout: 10000 });
  }

  // ========== Validation Helpers ==========

  /**
   * Check if settings page is displayed
   */
  async isSettingsPageDisplayed(): Promise<boolean> {
    return (
      (await this.elementExists(this.selectors.pageTitle)) &&
      (await this.elementExists(this.selectors.profile.section))
    );
  }

  /**
   * Get validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page
      .locator(this.selectors.validationError)
      .allTextContents();
    return errors.filter((e) => e.trim().length > 0);
  }

  /**
   * Assert settings saved successfully
   */
  async assertSettingsSaved() {
    const toast = await this.getText(this.selectors.toast);
    if (!toast || !toast.toLowerCase().includes("saved")) {
      throw new Error("Settings were not saved successfully");
    }
  }

  /**
   * Wait for settings to load
   */
  async waitForSettingsLoad() {
    await this.waitForPageLoad();
    await this.page.waitForSelector(this.selectors.profile.section, {
      state: "visible",
    });
  }

  /**
   * Check if user has premium features
   */
  async hasPremiumFeatures(): Promise<boolean> {
    // Check for premium-only elements
    const premiumElements = [
      '[data-testid="premium-badge"]',
      'button:has-text("Upgrade")',
      '[data-premium="true"]',
    ];

    for (const selector of premiumElements) {
      if (await this.elementExists(selector)) {
        return true;
      }
    }

    return false;
  }
}
