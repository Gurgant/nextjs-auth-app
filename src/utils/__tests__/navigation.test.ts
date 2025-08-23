import {
  localizedPath,
  localizedRedirect,
  getPathWithoutLocale,
  switchLocale,
  routes,
  isProtectedRoute,
  isPublicRoute,
} from "../navigation";
import { redirect } from "next/navigation";

// Mock Next.js navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

describe("Navigation Utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("localizedPath", () => {
    it("should prepend locale to paths", () => {
      expect(localizedPath("dashboard", "en")).toBe("/en/dashboard");
      expect(localizedPath("account/settings", "fr")).toBe(
        "/fr/account/settings",
      );
    });

    it("should handle paths with leading slash", () => {
      expect(localizedPath("/dashboard", "en")).toBe("/en/dashboard");
      expect(localizedPath("/account/settings", "fr")).toBe(
        "/fr/account/settings",
      );
    });

    it("should handle empty path (home)", () => {
      expect(localizedPath("", "en")).toBe("/en");
      expect(localizedPath("/", "fr")).toBe("/fr");
    });

    it("should work with array overload", () => {
      expect(localizedPath(["dashboard"], "en")).toBe("/en/dashboard");
      expect(localizedPath(["account", "settings"], "en")).toBe(
        "/en/account/settings",
      );
      expect(localizedPath(["", "dashboard", ""], "en")).toBe("/en/dashboard");
    });

    it("should handle all supported locales", () => {
      const locales = ["en", "es", "fr", "it", "de"] as const;
      locales.forEach((locale) => {
        expect(localizedPath("test", locale)).toBe(`/${locale}/test`);
      });
    });
  });

  describe("localizedRedirect", () => {
    it("should call redirect with localized path", () => {
      localizedRedirect("dashboard", "en");
      expect(redirect).toHaveBeenCalledWith("/en/dashboard");
    });

    it("should handle home redirect", () => {
      localizedRedirect("", "fr");
      expect(redirect).toHaveBeenCalledWith("/fr");
    });
  });

  describe("getPathWithoutLocale", () => {
    it("should extract path without locale", () => {
      expect(getPathWithoutLocale("/en/dashboard")).toBe("/dashboard");
      expect(getPathWithoutLocale("/fr/account/settings")).toBe(
        "/account/settings",
      );
      expect(getPathWithoutLocale("/es/")).toBe("/");
      expect(getPathWithoutLocale("/it")).toBe("/");
    });

    it("should handle locale with region", () => {
      expect(getPathWithoutLocale("/en-US/dashboard")).toBe("/dashboard");
      expect(getPathWithoutLocale("/fr-CA/settings")).toBe("/settings");
    });

    it("should return original path if no locale pattern", () => {
      expect(getPathWithoutLocale("/dashboard")).toBe("/dashboard");
      expect(getPathWithoutLocale("/123/dashboard")).toBe("/123/dashboard");
      expect(getPathWithoutLocale("/toolong/dashboard")).toBe(
        "/toolong/dashboard",
      );
    });

    it("should handle edge cases", () => {
      expect(getPathWithoutLocale("")).toBe("");
      expect(getPathWithoutLocale("/")).toBe("/");
      expect(getPathWithoutLocale("/e")).toBe("/e"); // Too short
      expect(getPathWithoutLocale("/eng/test")).toBe("/eng/test"); // Too long
    });
  });

  describe("switchLocale", () => {
    it("should switch locale while preserving path", () => {
      expect(switchLocale("/en/dashboard", "fr")).toBe("/fr/dashboard");
      expect(switchLocale("/es/account/settings", "de")).toBe(
        "/de/account/settings",
      );
      expect(switchLocale("/it/", "en")).toBe("/en");
    });

    it("should handle paths without locale", () => {
      expect(switchLocale("/dashboard", "en")).toBe("/en/dashboard");
      expect(switchLocale("/", "fr")).toBe("/fr");
    });
  });

  describe("routes helper", () => {
    it("should generate home routes", () => {
      expect(routes.home("en")).toBe("/en");
      expect(routes.home("fr")).toBe("/fr");
    });

    it("should generate dashboard routes", () => {
      expect(routes.dashboard("en")).toBe("/en/dashboard");
      expect(routes.dashboard("es")).toBe("/es/dashboard");
    });

    it("should generate auth routes", () => {
      expect(routes.signin("en")).toBe("/en/auth/signin");
      expect(routes.register("fr")).toBe("/fr/register");
    });

    it("should generate error routes with optional query", () => {
      expect(routes.error("en")).toBe("/en/auth/error");
      expect(routes.error("en", "OAuthAccountNotLinked")).toBe(
        "/en/auth/error?error=OAuthAccountNotLinked",
      );
      expect(routes.error("fr", "Access Denied")).toBe(
        "/fr/auth/error?error=Access%20Denied",
      );
    });

    it("should generate dynamic routes", () => {
      expect(routes.verifyEmail("en", "abc123")).toBe(
        "/en/verify-email/abc123",
      );
      expect(routes.linkAccount("en")).toBe("/en/link-account");
      expect(routes.linkAccount("en", "xyz789")).toBe(
        "/en/link-account/confirm/xyz789",
      );
    });
  });

  describe("isProtectedRoute", () => {
    it("should identify protected routes", () => {
      expect(isProtectedRoute("/en/dashboard")).toBe(true);
      expect(isProtectedRoute("/fr/account")).toBe(true);
      expect(isProtectedRoute("/es/settings")).toBe(true);
      expect(isProtectedRoute("/de/profile")).toBe(true);
    });

    it("should identify protected subroutes", () => {
      expect(isProtectedRoute("/en/dashboard/analytics")).toBe(true);
      expect(isProtectedRoute("/fr/account/security")).toBe(true);
      expect(isProtectedRoute("/settings/notifications")).toBe(true);
    });

    it("should return false for public routes", () => {
      expect(isProtectedRoute("/en/")).toBe(false);
      expect(isProtectedRoute("/fr/register")).toBe(false);
      expect(isProtectedRoute("/auth/signin")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isProtectedRoute("/dashboard-public")).toBe(false); // Not exact match
      expect(isProtectedRoute("/my-dashboard")).toBe(false); // Not exact match
    });
  });

  describe("isPublicRoute", () => {
    it("should identify public routes", () => {
      expect(isPublicRoute("/en/")).toBe(true);
      expect(isPublicRoute("/fr/register")).toBe(true);
      expect(isPublicRoute("/es/auth/signin")).toBe(true);
      expect(isPublicRoute("/de/auth/error")).toBe(true);
    });

    it("should identify public subroutes", () => {
      expect(isPublicRoute("/en/verify-email/token123")).toBe(true);
      expect(isPublicRoute("/reset-password/step2")).toBe(true);
    });

    it("should return false for protected routes", () => {
      expect(isPublicRoute("/en/dashboard")).toBe(false);
      expect(isPublicRoute("/account")).toBe(false);
      expect(isPublicRoute("/settings")).toBe(false);
    });

    it("should handle root path", () => {
      expect(isPublicRoute("/")).toBe(true);
      expect(isPublicRoute("/en")).toBe(true);
    });
  });
});
