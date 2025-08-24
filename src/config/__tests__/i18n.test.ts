import {
  ALLOWED_LOCALES,
  DEFAULT_LOCALE,
  isValidLocale,
  getSafeLocale,
  getSafeLocaleWithLogging,
  getLocaleOptions,
  shouldLogSecurityEvents,
} from "../i18n";

describe("i18n configuration", () => {
  describe("constants", () => {
    it("should have the correct allowed locales", () => {
      expect(ALLOWED_LOCALES).toEqual(["en", "es", "fr", "it", "de"]);
    });

    it("should have English as default locale", () => {
      expect(DEFAULT_LOCALE).toBe("en");
    });

    it("should ensure default locale is in allowed locales", () => {
      expect(ALLOWED_LOCALES).toContain(DEFAULT_LOCALE);
    });
  });

  describe("isValidLocale", () => {
    it("should return true for valid locales", () => {
      ALLOWED_LOCALES.forEach((locale) => {
        expect(isValidLocale(locale)).toBe(true);
      });
    });

    it("should return false for invalid locales", () => {
      expect(isValidLocale("xx")).toBe(false);
      expect(isValidLocale("eng")).toBe(false);
      expect(isValidLocale("EN")).toBe(false); // Case sensitive
      expect(isValidLocale("en-US")).toBe(false); // Not in our list
    });

    it("should return false for non-string values", () => {
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(undefined)).toBe(false);
      expect(isValidLocale(123)).toBe(false);
      expect(isValidLocale({})).toBe(false);
      expect(isValidLocale([])).toBe(false);
      expect(isValidLocale(true)).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isValidLocale("")).toBe(false);
      expect(isValidLocale(" en ")).toBe(false); // With spaces
      expect(isValidLocale("en\n")).toBe(false); // With newline
    });

    it("should be type guard", () => {
      const value: unknown = "en";
      if (isValidLocale(value)) {
        // TypeScript should know value is Locale here
        const locale: (typeof ALLOWED_LOCALES)[number] = value;
        expect(locale).toBe("en");
      }
    });
  });

  describe("getSafeLocale", () => {
    it("should return valid locales as-is", () => {
      ALLOWED_LOCALES.forEach((locale) => {
        expect(getSafeLocale(locale)).toBe(locale);
      });
    });

    it("should return default locale for invalid values", () => {
      expect(getSafeLocale("invalid")).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale(null)).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale(undefined)).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale(123)).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale("")).toBe(DEFAULT_LOCALE);
    });

    it("should handle security attack attempts", () => {
      expect(getSafeLocale("../../../etc/passwd")).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale('<script>alert("xss")</script>')).toBe(
        DEFAULT_LOCALE,
      );
      expect(getSafeLocale('"; DROP TABLE users; --')).toBe(DEFAULT_LOCALE);
      expect(getSafeLocale("%00null")).toBe(DEFAULT_LOCALE);
    });
  });

  describe("getSafeLocaleWithLogging", () => {
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      Object.defineProperty(process.env, "NODE_ENV", {
        value: originalEnv,
        configurable: true,
      });
    });

    it("should not log valid locales", () => {
      getSafeLocaleWithLogging("en", { logInvalid: true });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should log invalid locales in development", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
      });
      getSafeLocaleWithLogging("invalid", { logInvalid: true, source: "test" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Security] Invalid locale attempted: "invalid" from test',
      );
    });

    it("should use console.error in production", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
      });
      getSafeLocaleWithLogging("invalid", { logInvalid: true, source: "test" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Security] Invalid locale attempted: "invalid" from test',
      );
    });

    it("should not log when logInvalid is false", () => {
      getSafeLocaleWithLogging("invalid", { logInvalid: false });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should handle missing source", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
      });
      getSafeLocaleWithLogging("invalid", { logInvalid: true });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Security] Invalid locale attempted: "invalid" from unknown source',
      );
    });
  });

  describe("getLocaleOptions", () => {
    it("should return array of allowed locales", () => {
      const options = getLocaleOptions();
      expect(options).toEqual(ALLOWED_LOCALES);
    });

    it("should return readonly array", () => {
      const options = getLocaleOptions();
      expect(Object.isFrozen(options)).toBe(true);
    });
  });

  describe("shouldLogSecurityEvents", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return true in development", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
      });
      expect(shouldLogSecurityEvents()).toBe(true);
    });

    it("should return true when NEXT_PUBLIC_LOG_SECURITY_EVENTS is true", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
      });
      process.env.NEXT_PUBLIC_LOG_SECURITY_EVENTS = "true";
      expect(shouldLogSecurityEvents()).toBe(true);
    });

    it("should return false in production without flag", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
      });
      delete process.env.NEXT_PUBLIC_LOG_SECURITY_EVENTS;
      expect(shouldLogSecurityEvents()).toBe(false);
    });
  });
});
