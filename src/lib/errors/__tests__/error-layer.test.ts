/**
 * @jest-environment node
 *
 * What the error layer holds: the errors that the two commands create
 * (src/lib/commands/auth), each with its code, category, severity and status,
 * the console method that log() prints it with, and the event that its
 * constructor publishes.
 */
const mockPublish = jest.fn();
jest.mock("@/lib/events", () => ({
  eventBus: { publish: (event: unknown) => mockPublish(event) },
}));

import { z } from "zod";
import { BaseError } from "../base/base-error";
import { ErrorCategory, ErrorCode, ErrorSeverity } from "../base/error-codes";
import { createError } from "../error-builder";
import { ErrorFactory } from "../error-factory";

const zodError = () => {
  const result = z.object({ email: z.string().email() }).safeParse({
    email: "not-an-address",
  });
  if (result.success) throw new Error("the fixture input must be invalid");
  return result.error;
};

const CASES: {
  create: () => BaseError;
  name: string;
  code: string;
  category: string;
  severity: "low" | "high";
  statusCode: number;
  message: string;
  printedWith: "log" | "error";
}[] = [
  {
    create: () => ErrorFactory.validation.fromZod(zodError()),
    name: "ValidationError",
    code: "VAL_1200",
    category: "validation",
    severity: "low",
    statusCode: 400,
    message: "Validation failed",
    printedWith: "log",
  },
  {
    create: () =>
      ErrorFactory.validation.invalidInput(
        "currentPassword",
        undefined,
        "password",
      ),
    name: "InvalidInputError",
    code: "VAL_1201",
    category: "validation",
    severity: "low",
    statusCode: 400,
    message: "Invalid input for field: currentPassword",
    printedWith: "log",
  },
  {
    create: () =>
      ErrorFactory.business.operationNotAllowed(
        "change password",
        "No password set for this account",
      ),
    name: "OperationNotAllowedError",
    code: "BIZ_1301",
    category: "business_logic",
    severity: "low",
    statusCode: 422,
    message:
      "Operation 'change password' is not allowed: No password set for this account",
    printedWith: "log",
  },
  {
    create: () => ErrorFactory.business.notFound("User", "user-1"),
    name: "ResourceNotFoundError",
    code: "BIZ_1302",
    category: "business_logic",
    severity: "low",
    statusCode: 404,
    message: "User with ID 'user-1' not found",
    printedWith: "log",
  },
  {
    create: () =>
      ErrorFactory.business.alreadyExists("User", { field: "email" }),
    name: "ResourceAlreadyExistsError",
    code: "BIZ_1303",
    category: "business_logic",
    severity: "low",
    statusCode: 409,
    message: "User already exists",
    printedWith: "log",
  },
  {
    create: () => ErrorFactory.wrap(new Error("boom")),
    name: "InternalError",
    code: "SYS_1500",
    category: "system",
    severity: "high",
    statusCode: 500,
    message: "boom",
    printedWith: "error",
  },
];

describe("the error layer", () => {
  let consoleSpies: Record<"log" | "warn" | "error", jest.SpyInstance>;

  beforeEach(() => {
    mockPublish.mockReset();
    consoleSpies = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(CASES)(
    "$name",
    ({
      create,
      name,
      code,
      category,
      severity,
      statusCode,
      message,
      printedWith,
    }) => {
      it("carries its code, category, severity and status", () => {
        const error = create();

        expect(error).toBeInstanceOf(BaseError);
        expect(error.toJSON()).toMatchObject({
          name,
          code,
          category,
          severity,
          statusCode,
          message,
        });
        expect(error.getUserMessage()).toBe(message);
      });

      it(`is printed by log() with console.${printedWith}, under its severity`, () => {
        create().log();

        const calls = {
          log: consoleSpies.log.mock.calls,
          warn: consoleSpies.warn.mock.calls,
          error: consoleSpies.error.mock.calls,
        };
        expect(calls[printedWith]).toEqual([
          [
            `[${severity.toUpperCase()}] ${name}:`,
            expect.objectContaining({ code, category, severity, message }),
          ],
        ]);
        expect({ ...calls, [printedWith]: [] }).toEqual({
          log: [],
          warn: [],
          error: [],
        });
      });

      it("publishes one error event when it is created", () => {
        create();

        expect(mockPublish).toHaveBeenCalledTimes(1);
        expect(mockPublish.mock.calls[0][0]).toMatchObject({
          type: "system.error_occurred",
          payload: {
            errorType: name,
            message,
            severity,
            context: { code, category },
          },
        });
      });
    },
  );

  // A code, a category or a severity that no error carries has no reader: the
  // enums hold what the cases above produce, and nothing else.
  it("has no code, category or severity that none of its errors carries", () => {
    const carried = (key: "code" | "category" | "severity") =>
      [...new Set(CASES.map((error) => error[key]))].sort();

    expect(carried("code")).toEqual(Object.values(ErrorCode).sort());
    expect(carried("category")).toEqual(Object.values(ErrorCategory).sort());
    expect(carried("severity")).toEqual(Object.values(ErrorSeverity).sort());
  });

  it("keeps the messages of a Zod error by field", () => {
    const error = ErrorFactory.validation.fromZod(zodError());

    expect(error.details).toEqual({ email: [expect.any(String)] });
  });

  describe("ErrorFactory.wrap", () => {
    it("returns an error of the layer as it is", () => {
      const error = ErrorFactory.business.notFound("User");

      expect(ErrorFactory.wrap(error)).toBe(error);
    });

    it("keeps an Error as the cause of an internal error", () => {
      const thrown = new Error("connection refused");

      const error = ErrorFactory.wrap(thrown, { userId: "user-1" });

      expect(error.cause).toBe(thrown);
      expect(error.details).toEqual({ originalError: "connection refused" });
      expect(error.context).toMatchObject({ userId: "user-1" });
    });

    it("keeps anything else that was thrown in the context", () => {
      const error = ErrorFactory.wrap("a string was thrown");

      expect(error.message).toBe("An unknown error occurred");
      expect(error.context).toMatchObject({
        originalError: "a string was thrown",
      });
    });
  });

  describe("createError", () => {
    it("puts the user id and the correlation id into the error and its event", () => {
      const error = createError()
        .withUserId("user-1")
        .withCorrelationId("command-1")
        .business.alreadyExists("User", { field: "email" });

      expect(error.context).toEqual({
        userId: "user-1",
        correlationId: "command-1",
        timestamp: error.timestamp,
      });
      expect(mockPublish.mock.calls[0][0]).toMatchObject({
        metadata: { userId: "user-1", correlationId: "command-1" },
      });
    });

    it("builds the same errors as the factory", () => {
      const builder = createError();

      expect(builder.validation.invalidInput("name").code).toBe("VAL_1201");
      expect(builder.business.operationNotAllowed("a", "b").code).toBe(
        "BIZ_1301",
      );
      expect(builder.business.alreadyExists("User", {}).code).toBe("BIZ_1303");
    });
  });
});
