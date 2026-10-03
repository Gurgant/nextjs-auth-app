import { renderHook } from "@testing-library/react";
import { useParams } from "next/navigation";
import { useSafeLocale } from "../use-safe-locale";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useParams: jest.fn(),
}));

// Mock the config module
jest.mock("@/config/i18n", () => ({
  getSafeLocale: jest.fn((value) => {
    const validLocales = ["en", "es", "fr", "it", "de"];
    return validLocales.includes(value as string) ? value : "en";
  }),
  getSafeLocaleWithLogging: jest.fn(),
  shouldLogSecurityEvents: jest.fn(() => false),
  type: {} as any,
}));

describe("useSafeLocale", () => {
  const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("should return valid locale from params", () => {
      mockUseParams.mockReturnValue({ locale: "en" });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should return default locale for invalid locale", () => {
      mockUseParams.mockReturnValue({ locale: "invalid" });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle all valid locales", () => {
      const validLocales = ["en", "es", "fr", "it", "de"];

      validLocales.forEach((locale) => {
        mockUseParams.mockReturnValue({ locale });
        const { result } = renderHook(() => useSafeLocale());
        expect(result.current).toBe(locale);
      });
    });

    it("should handle missing locale in params", () => {
      mockUseParams.mockReturnValue({});
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle null/undefined params", () => {
      mockUseParams.mockReturnValue(null as any);
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });
  });

  describe("security scenarios", () => {
    it("should sanitize path traversal attempts", () => {
      mockUseParams.mockReturnValue({ locale: "../../../etc/passwd" });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should sanitize XSS attempts", () => {
      mockUseParams.mockReturnValue({
        locale: '<script>alert("xss")</script>',
      });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should sanitize SQL injection attempts", () => {
      mockUseParams.mockReturnValue({ locale: '"; DROP TABLE users; --' });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle encoded values", () => {
      mockUseParams.mockReturnValue({ locale: "%2e%2e%2f%2e%2e" });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });
  });

  describe("edge cases", () => {
    it("should handle numeric locale", () => {
      mockUseParams.mockReturnValue({ locale: 123 as any });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle object locale", () => {
      mockUseParams.mockReturnValue({ locale: { malicious: "data" } as any });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle array locale", () => {
      mockUseParams.mockReturnValue({ locale: ["en", "fr"] as any });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });

    it("should handle very long strings", () => {
      mockUseParams.mockReturnValue({ locale: "a".repeat(1000) });
      const { result } = renderHook(() => useSafeLocale());
      expect(result.current).toBe("en");
    });
  });
});
