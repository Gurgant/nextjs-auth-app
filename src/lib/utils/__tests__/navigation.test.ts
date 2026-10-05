import {
  localizedPath,
  getPathWithoutLocale,
  switchLocale,
  routes,
} from "../navigation";

describe("Navigation Utilities", () => {
  describe("localizedPath", () => {
    it("should prepend locale to paths", () => {
      expect(localizedPath("dashboard", "en")).toBe("/en/dashboard");
      expect(localizedPath("dashboard/user", "fr")).toBe("/fr/dashboard/user");
    });

    it("should handle paths with leading slash", () => {
      expect(localizedPath("/dashboard", "en")).toBe("/en/dashboard");
      expect(localizedPath("/dashboard/user", "fr")).toBe("/fr/dashboard/user");
    });

    it("should handle empty path (home)", () => {
      expect(localizedPath("", "en")).toBe("/en");
      expect(localizedPath("/", "fr")).toBe("/fr");
    });

    it("should work with array overload", () => {
      expect(localizedPath(["dashboard"], "en")).toBe("/en/dashboard");
      expect(localizedPath(["dashboard", "user"], "en")).toBe(
        "/en/dashboard/user",
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

  describe("getPathWithoutLocale", () => {
    it("should extract path without locale", () => {
      expect(getPathWithoutLocale("/en/dashboard")).toBe("/dashboard");
      expect(getPathWithoutLocale("/fr/dashboard/user")).toBe(
        "/dashboard/user",
      );
      expect(getPathWithoutLocale("/es/")).toBe("/");
      expect(getPathWithoutLocale("/it")).toBe("/");
    });

    it("should handle locale with region", () => {
      expect(getPathWithoutLocale("/en-US/dashboard")).toBe("/dashboard");
      expect(getPathWithoutLocale("/fr-CA/account")).toBe("/account");
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
      expect(switchLocale("/es/dashboard/user", "de")).toBe(
        "/de/dashboard/user",
      );
      expect(switchLocale("/it/", "en")).toBe("/en");
    });

    it("should handle paths without locale", () => {
      expect(switchLocale("/dashboard", "en")).toBe("/en/dashboard");
      expect(switchLocale("/", "fr")).toBe("/fr");
    });

    it("should keep a dynamic segment as it is", () => {
      expect(switchLocale("/en/verify-email/a1B2c3D4", "it")).toBe(
        "/it/verify-email/a1B2c3D4",
      );
    });

    // The language selector navigates to the result without asking a list of
    // routes, so the result itself has to be safe: whatever the path is, a
    // URL parser resolves it on this origin and under the new locale.
    it.each([
      ["//evil.example", "/es//evil.example"],
      ["//evil.example/en", "/es//evil.example/en"],
      ["/en//evil.example", "/es//evil.example"],
      ["/\\evil.example", "/es/\\evil.example"],
      ["/en/\\evil.example", "/es/\\evil.example"],
      ["https://evil.example/en", "/es/https://evil.example/en"],
      ["javascript:alert(1)", "/es/javascript:alert(1)"],
      ["en", "/es/en"],
      ["", "/es"],
      // No valid path of a URL: a space, a broken escape, half a surrogate pair.
      ["/en/a b/%zz/\ud83d", "/es/a b/%zz/\ud83d"],
      // Dot segments that a browser resolves inside the new locale.
      ["/en/./admin", "/es/./admin"],
      ["/en/a/../b", "/es/a/../b"],
      ["/en/../es/admin", "/es/../es/admin"],
      // Dot segments that would lead out of it: the home page instead.
      ["/en/..", "/es"],
      ["/en/../admin", "/es"],
      ["/en/../esx", "/es"],
      ["/en/a/../../admin", "/es"],
      ["/en/..//evil.example", "/es"],
      ["/en/%2e%2e/admin", "/es"],
      ["/en/.%2E/admin", "/es"],
      ["/en/..\\admin", "/es"],
      ["/en/.\t./admin", "/es"],
      ["/../admin", "/es"],
    ])(
      "should stay on this origin and under the new locale for %j",
      (currentPath, expected) => {
        const switched = switchLocale(currentPath, "es");

        expect(switched).toBe(expected);
        const target = new URL(switched, "https://app.example");
        expect(target.origin).toBe("https://app.example");
        expect(`${target.pathname}/`.startsWith("/es/")).toBe(true);
      },
    );
  });

  describe("routes helper", () => {
    it("should generate dashboard routes", () => {
      expect(routes.dashboard("en")).toBe("/en/dashboard");
      expect(routes.dashboard("es")).toBe("/es/dashboard");
    });
  });
});
