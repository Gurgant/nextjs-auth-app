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

  describe("edge cases", () => {
    it("handles errors from getCurrentLocale gracefully", async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue("en");
      mockGetCurrentLocale.mockRejectedValue(new Error("Cookie error"));

      await expect(resolveFormLocale(formData)).rejects.toThrow("Cookie error");
    });
  });
});
