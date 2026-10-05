import { z } from "zod";
import {
  createErrorResponse,
  createValidationErrorResponse,
  isErrorResponse,
  getFieldError,
  getAllFieldErrors,
  logActionError,
  type ErrorResponse,
  type SuccessResponse,
  type ActionResponse,
} from "../form-responses";
import { translateValidationErrors } from "@/lib/validation";
import { getTranslations } from "next-intl/server";

// Mock dependencies
jest.mock("@/lib/validation");
jest.mock("next-intl/server");

// Mock console.error to prevent test output pollution
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe("form-responses", () => {
  const mockTranslateValidationErrors =
    translateValidationErrors as jest.MockedFunction<
      typeof translateValidationErrors
    >;
  const mockGetTranslations = getTranslations as jest.MockedFunction<
    typeof getTranslations
  >;

  // Create a proper mock translation function
  const createMockTranslationFn = () => {
    const fn = jest.fn((key: string) => key) as any;
    fn.rich = jest.fn();
    fn.markup = jest.fn();
    fn.raw = jest.fn();
    fn.has = jest.fn();
    return fn;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createErrorResponse", () => {
    it("creates basic error response", () => {
      const result = createErrorResponse("Test error");

      expect(result).toEqual({
        success: false,
        message: "Test error",
      });
    });

    it("creates error response with field errors", () => {
      const errors = { email: "Invalid email", password: "Too weak" };
      const result = createErrorResponse("Validation failed", errors);

      expect(result).toEqual({
        success: false,
        message: "Validation failed",
        errors,
      });
    });

    it("handles ZodError properly", () => {
      const zodError = new z.ZodError([
        {
          code: "invalid_type",
          expected: "string",
          received: "number",
          path: ["email"],
          message: "Expected string",
        } as z.ZodIssue,
      ]);

      const result = createErrorResponse("Validation error", zodError);

      expect(result).toEqual({
        success: false,
        message: "Validation error",
        errors: { email: ["Expected string"] },
      });
    });

    it("handles array field errors", () => {
      const errors = { tags: ["Too short", "Invalid character"] };
      const result = createErrorResponse("Multiple errors", errors);

      expect(result).toEqual({
        success: false,
        message: "Multiple errors",
        errors,
      });
    });
  });

  describe("createValidationErrorResponse", () => {
    it("creates validation error with translated messages", async () => {
      // Create a ZodError using a failed parse
      const schema = z.object({
        password: z.string().min(8),
      });
      let zodError: z.ZodError;
      try {
        schema.parse({ password: "short" });
        zodError = new z.ZodError([]); // This shouldn't happen
      } catch (error) {
        zodError = error as z.ZodError;
      }

      const mockT = createMockTranslationFn();
      mockT.mockImplementation((key: string) => {
        if (key === "form.validationError") return "Validation error occurred";
        return key;
      });
      mockGetTranslations.mockResolvedValue(mockT);
      mockTranslateValidationErrors.mockResolvedValue({
        password: "Password too short",
      });

      const result = await createValidationErrorResponse(zodError, "en");

      expect(mockTranslateValidationErrors).toHaveBeenCalledWith(
        zodError,
        "en",
      );
      expect(mockGetTranslations).toHaveBeenCalledWith({
        locale: "en",
        namespace: "validation",
      });
      expect(mockT).toHaveBeenCalledWith("form.validationError");
      expect(result).toEqual({
        success: false,
        message: "Validation error occurred",
        errors: { password: "Password too short" },
      });
    });

    it("uses custom message when provided", async () => {
      const zodError = new z.ZodError([]);
      const mockT = createMockTranslationFn();
      mockGetTranslations.mockResolvedValue(mockT);
      mockTranslateValidationErrors.mockResolvedValue({});

      const result = await createValidationErrorResponse(
        zodError,
        "es",
        "Custom error message",
      );

      expect(mockGetTranslations).not.toHaveBeenCalled();
      expect(result.message).toBe("Custom error message");
    });
  });

  describe("Type Guards", () => {
    describe("isErrorResponse", () => {
      it("returns true for error responses", () => {
        const error: ErrorResponse = { success: false, message: "Error" };
        expect(isErrorResponse(error)).toBe(true);
      });

      it("returns false for success responses", () => {
        const success: SuccessResponse = { success: true, message: "Success" };
        expect(isErrorResponse(success)).toBe(false);
      });
    });
  });

  describe("Error Extraction Utilities", () => {
    describe("getFieldError", () => {
      it("returns field error when exists", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
          errors: { email: "Invalid email" },
        };

        expect(getFieldError(response, "email")).toBe("Invalid email");
      });

      it("returns first error when field has array of errors", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
          errors: { tags: ["Too short", "Invalid character"] },
        };

        expect(getFieldError(response, "tags")).toBe("Too short");
      });

      it("returns undefined when field error does not exist", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
          errors: { email: "Invalid" },
        };

        expect(getFieldError(response, "password")).toBeUndefined();
      });

      it("returns undefined when no errors object", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
        };

        expect(getFieldError(response, "email")).toBeUndefined();
      });
    });

    describe("getAllFieldErrors", () => {
      it("returns all field errors as flat array", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
          errors: {
            email: "Invalid email",
            password: ["Too short", "No special character"],
            name: "Required",
          },
        };

        const errors = getAllFieldErrors(response);

        expect(errors).toHaveLength(4);
        expect(errors).toContain("Invalid email");
        expect(errors).toContain("Too short");
        expect(errors).toContain("No special character");
        expect(errors).toContain("Required");
      });

      it("returns empty array when no errors", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
        };

        expect(getAllFieldErrors(response)).toEqual([]);
      });

      it("filters out non-string values", () => {
        const response: ErrorResponse = {
          success: false,
          message: "Error",
          errors: {
            field1: "Error 1",
            field2: null as any,
            field3: undefined as any,
            field4: 123 as any,
          },
        };

        const errors = getAllFieldErrors(response);

        expect(errors).toEqual(["Error 1"]);
      });
    });
  });

  describe("logActionError", () => {
    it("logs error with action name and context", () => {
      const error = new Error("Test error");
      const context = { userId: "123", operation: "update" };

      logActionError("updateUser", error, context);

      expect(console.error).toHaveBeenCalledWith(
        "[updateUser] Error:",
        expect.objectContaining({
          error,
          message: "Test error",
          stack: expect.any(String),
          context,
          timestamp: expect.any(String),
        }),
      );
    });

    it("handles non-Error objects", () => {
      const error = { code: "CUSTOM_ERROR", detail: "Something went wrong" };

      logActionError("customAction", error);

      expect(console.error).toHaveBeenCalledWith(
        "[customAction] Error:",
        expect.objectContaining({
          error,
          message: "Unknown error",
          stack: undefined,
          context: undefined,
          timestamp: expect.any(String),
        }),
      );
    });

    it("handles string errors", () => {
      const error = "String error message";

      logActionError("stringError", error);

      expect(console.error).toHaveBeenCalledWith(
        "[stringError] Error:",
        expect.objectContaining({
          error,
          message: "Unknown error",
          stack: undefined,
        }),
      );
    });
  });

  describe("Integration Tests", () => {
    it("works with complex validation scenarios", async () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        age: z.number().min(18),
      });

      try {
        schema.parse({
          email: "invalid",
          password: "short",
          age: 16,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const response = createErrorResponse("Validation failed", error);

          expect(response.errors).toHaveProperty("email");
          expect(response.errors).toHaveProperty("password");
          expect(response.errors).toHaveProperty("age");
          expect(getAllFieldErrors(response).length).toBeGreaterThan(0);
        }
      }
    });

    it("type narrowing works correctly", () => {
      const responses: ActionResponse[] = [
        { success: true, message: "Success" },
        createErrorResponse("Error"),
        createErrorResponse("Field error", { email: "Invalid" }),
      ];

      responses.forEach((response) => {
        if (isErrorResponse(response)) {
          // TypeScript should know this is ErrorResponse
          expect(response.success).toBe(false);
          // response.data should not exist here (type check)
        } else {
          // TypeScript should know this is SuccessResponse
          expect(response.success).toBe(true);
          // response.errors should not exist here (type check)
        }
      });
    });
  });
});
