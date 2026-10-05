import { resolveFormLocale } from "../form-locale-server";
import { getCurrentLocale } from "../get-locale";
import { getLocaleFromFormData } from "../form-locale";

// Mock dependencies
jest.mock("../get-locale");
jest.mock("../form-locale");

describe("form-locale-server", () => {
  const mockGetCurrentLocale = getCurrentLocale as jest.MockedFunction<
    typeof getCurrentLocale
  >;
  const mockGetLocaleFromFormData =
    getLocaleFromFormData as jest.MockedFunction<typeof getLocaleFromFormData>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("resolveFormLocale", () => {
    it("uses form locale when not default (en)", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("es");
      mockGetCurrentLocale.mockResolvedValue("fr");

      const result = await resolveFormLocale(formData);

      expect(result).toBe("es");
      expect(mockGetLocaleFromFormData).toHaveBeenCalledWith(formData);
      expect(mockGetCurrentLocale).toHaveBeenCalled();
    });

    it("uses cookie locale when form locale is default (en)", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("en");
      mockGetCurrentLocale.mockResolvedValue("fr");

      const result = await resolveFormLocale(formData);

      expect(result).toBe("fr");
      expect(mockGetLocaleFromFormData).toHaveBeenCalledWith(formData);
      expect(mockGetCurrentLocale).toHaveBeenCalled();
    });

    it("returns en when both form and cookie are en", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("en");
      mockGetCurrentLocale.mockResolvedValue("en");

      const result = await resolveFormLocale(formData);

      expect(result).toBe("en");
    });

    it("handles empty form data", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("en");
      mockGetCurrentLocale.mockResolvedValue("de");

      const result = await resolveFormLocale(formData);

      expect(result).toBe("de");
    });
  });

  // The form field and the cookie both come from the client. Only one of the
  // five supported locales is used; any other value counts as not sent.
  describe("values that are not a supported locale", () => {
    const UNSUPPORTED = ["xx", "en-US", '"><script>alert(1)</script>', "DE"];

    it.each(UNSUPPORTED)(
      "uses the cookie locale instead of the form value %p",
      async (formLocale) => {
        mockGetLocaleFromFormData.mockReturnValue(formLocale);
        mockGetCurrentLocale.mockResolvedValue("fr");

        await expect(resolveFormLocale(new FormData())).resolves.toBe("fr");
      },
    );

    it.each(UNSUPPORTED)(
      "uses the form locale instead of the cookie value %p",
      async (cookieLocale) => {
        mockGetLocaleFromFormData.mockReturnValue("es");
        mockGetCurrentLocale.mockResolvedValue(cookieLocale);

        await expect(resolveFormLocale(new FormData())).resolves.toBe("es");
      },
    );

    it.each(UNSUPPORTED)(
      "answers the default locale when the form says en and the cookie %p",
      async (cookieLocale) => {
        mockGetLocaleFromFormData.mockReturnValue("en");
        mockGetCurrentLocale.mockResolvedValue(cookieLocale);

        await expect(resolveFormLocale(new FormData())).resolves.toBe("en");
      },
    );

    it.each(UNSUPPORTED)(
      "answers the default locale when both are %p",
      async (value) => {
        mockGetLocaleFromFormData.mockReturnValue(value);
        mockGetCurrentLocale.mockResolvedValue(value);

        await expect(resolveFormLocale(new FormData())).resolves.toBe("en");
      },
    );

    // A form field can hold a file: the real getLocaleFromFormData hands it
    // on as it is.
    it("uses the cookie locale when the form field holds a file", async () => {
      const formData = new FormData();
      formData.set("_locale", new Blob(["de"]), "locale.txt");
      mockGetLocaleFromFormData.mockImplementation(
        jest.requireActual<typeof import("../form-locale")>("../form-locale")
          .getLocaleFromFormData,
      );
      mockGetCurrentLocale.mockResolvedValue("it");

      expect(typeof formData.get("_locale")).toBe("object");
      await expect(resolveFormLocale(formData)).resolves.toBe("it");
    });
  });

  describe("edge cases", () => {
    it("handles errors from getCurrentLocale gracefully", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("en");
      mockGetCurrentLocale.mockRejectedValue(new Error("Cookie error"));

      await expect(resolveFormLocale(formData)).rejects.toThrow("Cookie error");
    });
  });
});
