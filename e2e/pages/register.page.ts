import { Page, expect } from "@playwright/test";
import { BasePage } from "./base.page";

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
    termsCheckbox: 'input[name="terms"]',
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
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to register page
   */
  async goto() {
    await super.goto("/en/register");
    await this.waitForPageLoad();
  }

  /**
   * Fill registration form
   */
  async fillRegistrationForm(data: {
    name: string;
    email: string;
    password: string;
    confirmPassword?: string;
  }) {
    await this.fillField(this.selectors.nameInput, data.name);
    await this.fillField(this.selectors.emailInput, data.email);
    await this.fillField(this.selectors.passwordInput, data.password);
    await this.fillField(
      this.selectors.confirmPasswordInput,
      data.confirmPassword || data.password,
    );
  }

  /**
   * Submit registration form
   */
  async submitRegistration() {
    const button = this.page.locator(this.selectors.submitButton);
    await button.click();
  }

  /**
   * Complete registration flow
   */
  async register(data: {
    name: string;
    email: string;
    password: string;
    confirmPassword?: string;
    acceptTerms?: boolean;
    newsletter?: boolean;
  }) {
    await this.fillRegistrationForm(data);

    // IMPORTANT: Terms checkbox is REQUIRED for registration
    // If acceptTerms is true or undefined, we check it
    if (data.acceptTerms !== false) {
      // Always try to check the terms checkbox if not explicitly false
      const termsCheckbox = this.page.locator(this.selectors.termsCheckbox);
      if ((await termsCheckbox.count()) > 0) {
        await termsCheckbox.check();
        // Wait for the form state to update
        await this.page.waitForTimeout(500);
      }
    }

    if (data.newsletter) {
      await this.subscribeNewsletter();
    }

    // Wait for form state to update
    await this.page.waitForTimeout(500);

    // Now submit - button should be enabled if terms are checked
    await this.submitRegistration();

    // Wait for navigation or response
    await this.page.waitForTimeout(2000);
  }

  /**
   * Register with OAuth provider
   */
  async registerWithOAuth(provider: "google" | "github") {
    const selector =
      provider === "google"
        ? this.selectors.googleButton
        : this.selectors.githubButton;

    await this.page.click(selector);

    // Handle OAuth flow in new window/tab if needed
    const [popup] = await Promise.all([
      this.page.waitForEvent("popup"),
      this.page.click(selector),
    ]).catch(() => [null]);

    if (popup) {
      // Handle OAuth provider registration in popup
      await popup.waitForLoadState();
      // Add provider-specific logic here
      await popup.close();
    }
  }

  /**
   * Accept terms and conditions
   */
  async acceptTerms() {
    const termsCheckbox = this.page.locator(this.selectors.termsCheckbox);
    if ((await termsCheckbox.count()) > 0) {
      await termsCheckbox.check();
      // Wait for the form state to update
      await this.page.waitForTimeout(500);
    } else {
      // If no checkbox found, it might not be required
      console.log("No terms checkbox found - might not be required");
    }
  }

  /**
   * Subscribe to newsletter
   */
  async subscribeNewsletter() {
    await this.page.click(this.selectors.newsletterCheckbox);
  }

  /**
   * Click sign in link
   */
  async clickSignIn() {
    await this.page.click(this.selectors.signInLink);
    await this.waitForNavigation();
  }

  /**
   * Check if registration was successful
   */
  async isRegistrationSuccessful(): Promise<boolean> {
    // Wait for success message or redirect (registration has 2-second delay)
    console.log("Checking for registration success...");

    // First check for success state or message
    await this.page.waitForTimeout(1000);

    // Look for success indicators
    const successIndicators = [
      '[data-type="success"]',
      ".bg-green",
      ".alert-success",
      '[data-icon="check"]',
      "text=successfully",
      "text=registered",
      "text=created",
    ];

    for (const selector of successIndicators) {
      const isVisible = await this.page
        .locator(selector)
        .isVisible()
        .catch(() => false);
      if (isVisible) {
        console.log(`Found success indicator: ${selector}`);
        return true;
      }
    }

    // Wait for redirect to home page with registered=true parameter (with longer timeout for 2s delay)
    try {
      console.log("Waiting for redirect to home page...");
      await this.page.waitForURL("**?registered=true", { timeout: 15000 });
      console.log("Successfully redirected to home page with registered=true");
      return true;
    } catch (error) {
      console.log(
        "No registered=true redirect detected, checking current state...",
      );
    }

    // Check current URL for success indicators
    const currentUrl = this.page.url();
    console.log("Current URL:", currentUrl);

    const hasRegisteredParam = currentUrl.includes("registered=true");
    const leftRegistrationPage = !currentUrl.includes("/register");

    if (hasRegisteredParam) {
      console.log("Found registered=true parameter in URL");
      return true;
    }

    if (leftRegistrationPage) {
      console.log("Left registration page - likely successful");
      return true;
    }

    // Final check: look for welcome message or authenticated state
    const hasWelcomeMessage = await this.hasText("Welcome").catch(() => false);
    const hasAuthenticatedContent = await this.page
      .locator('[data-testid="authenticated-home"]')
      .isVisible()
      .catch(() => false);

    if (hasWelcomeMessage || hasAuthenticatedContent) {
      console.log("Found welcome message or authenticated state");
      return true;
    }

    console.log("Registration success not detected");
    return false;
  }

  /**
   * Get registration error message
   */
  async getRegistrationError(): Promise<string | null> {
    // Wait for error to appear after form submission
    await this.page.waitForTimeout(2000);

    // Check for error in AlertMessage component (actual implementation) with timeout
    const alertErrorExists = await this.page
      .locator('[data-type="error"]')
      .isVisible()
      .catch(() => false);
    if (alertErrorExists) {
      const alertError = await this.page
        .locator('[data-type="error"]')
        .textContent();
      if (alertError) return alertError;
    }

    const redAlertExists = await this.page
      .locator(".bg-red")
      .isVisible()
      .catch(() => false);
    if (redAlertExists) {
      const redAlert = await this.page.locator(".bg-red").textContent();
      if (redAlert) return redAlert;
    }

    // Fallback to original selectors
    if (await this.elementExists(this.selectors.errorMessage)) {
      return await this.getText(this.selectors.errorMessage);
    }

    return await this.getErrorMessage();
  }

  /**
   * Check if email verification is required
   */
  async isEmailVerificationRequired(): Promise<boolean> {
    return (
      (await this.elementExists(this.selectors.emailVerificationMessage)) ||
      (await this.hasText("verify your email"))
    );
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail() {
    await this.page.click(this.selectors.resendEmailButton);
  }

  /**
   * Get password strength indicator
   */
  async getPasswordStrength(): Promise<string | null> {
    if (await this.elementExists(this.selectors.passwordStrength)) {
      return await this.getText(this.selectors.passwordStrength);
    }
    return null;
  }

  /**
   * Check password requirements
   */
  async checkPasswordRequirements(): Promise<{
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  }> {
    const requirements = {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false,
    };

    // Check for requirement indicators
    const indicators = await this.page.$$('[data-testid^="password-req-"]');
    for (const indicator of indicators) {
      const testId = await indicator.getAttribute("data-testid");
      const isValid = (await indicator.getAttribute("data-valid")) === "true";

      if (testId?.includes("length")) requirements.length = isValid;
      if (testId?.includes("uppercase")) requirements.uppercase = isValid;
      if (testId?.includes("lowercase")) requirements.lowercase = isValid;
      if (testId?.includes("number")) requirements.number = isValid;
      if (testId?.includes("special")) requirements.special = isValid;
    }

    return requirements;
  }

  /**
   * Get form validation errors
   */
  async getValidationErrors(): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};

    // Check name field error (InputWithIcon component renders errors as p.text-red-600)
    const nameErrorSelector =
      'p.text-red-600[id*="name"], p.text-red-600:has-text("name"), .text-red-600:has-text("Name")';
    const nameError = await this.page
      .locator(nameErrorSelector)
      .first()
      .textContent()
      .catch(() => null);
    if (nameError) errors.name = nameError;

    // Check email field error
    const emailErrorSelector =
      'p.text-red-600[id*="email"], p.text-red-600:has-text("email"), .text-red-600:has-text("Email")';
    const emailError = await this.page
      .locator(emailErrorSelector)
      .first()
      .textContent()
      .catch(() => null);
    if (emailError) errors.email = emailError;

    // Check password field error
    const passwordErrorSelector =
      'p.text-red-600[id*="password"], p.text-red-600:has-text("password"), .text-red-600:has-text("Password")';
    const passwordError = await this.page
      .locator(passwordErrorSelector)
      .first()
      .textContent()
      .catch(() => null);
    if (passwordError) errors.password = passwordError;

    // Check confirm password field error
    const confirmErrorSelector =
      'p.text-red-600[id*="confirmPassword"], p.text-red-600:has-text("confirm"), .text-red-600:has-text("match")';
    const confirmError = await this.page
      .locator(confirmErrorSelector)
      .first()
      .textContent()
      .catch(() => null);
    if (confirmError) errors.confirmPassword = confirmError;

    // Also check for generic error messages in AlertMessage components
    const alertError = await this.page
      .locator('[data-type="error"]')
      .textContent()
      .catch(() => null);
    if (alertError && !Object.keys(errors).length) {
      // If we have an alert error but no field errors, add it as a general error
      errors.general = alertError;
    }

    return errors;
  }

  /**
   * Assert registration page is displayed
   */
  async assertRegistrationPageDisplayed() {
    await this.assertVisible(this.selectors.nameInput);
    await this.assertVisible(this.selectors.emailInput);
    await this.assertVisible(this.selectors.passwordInput);
    await this.assertVisible(this.selectors.confirmPasswordInput);
    await this.assertVisible(this.selectors.submitButton);
  }

  /**
   * Assert registration error is displayed
   */
  async assertRegistrationError(expectedError?: string) {
    // Wait for error to appear
    await this.page.waitForTimeout(2000);

    // Check if any error display is visible
    const hasAlertError = await this.page
      .locator('[data-type="error"]')
      .isVisible();
    const hasRedAlert = await this.page.locator(".bg-red").isVisible();
    const hasErrorClass = await this.page.locator(".alert-error").isVisible();
    const hasOriginalError = await this.elementExists(
      this.selectors.errorMessage,
    );

    const hasAnyError =
      hasAlertError || hasRedAlert || hasErrorClass || hasOriginalError;
    expect(hasAnyError).toBeTruthy();

    if (expectedError) {
      const errorMessage = await this.getRegistrationError();
      expect(errorMessage).toContain(expectedError);
    }
  }

  /**
   * Assert registration success
   */
  async assertRegistrationSuccess() {
    const success = await this.isRegistrationSuccessful();
    if (!success) {
      throw new Error("Registration was not successful");
    }
  }

  /**
   * Assert email verification required
   */
  async assertEmailVerificationRequired() {
    const required = await this.isEmailVerificationRequired();
    if (!required) {
      throw new Error("Email verification message not displayed");
    }
  }

  /**
   * Check if loading
   */
  async isLoading(): Promise<boolean> {
    return await this.elementExists(this.selectors.loadingSpinner);
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete() {
    await this.page.waitForSelector(this.selectors.loadingSpinner, {
      state: "hidden",
    });
  }

  /**
   * Generate random user data
   */
  static generateRandomUser() {
    const timestamp = Date.now();
    return {
      name: `Test User ${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: "Test123!", // Use project standard password
      confirmPassword: "Test123!", // Use project standard password
    };
  }
}
