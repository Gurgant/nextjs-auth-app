/**
 * @jest-environment node
 *
 * LoggingMiddleware.before measures the input for a log line; an input that
 * has no JSON form must not abort the command. LoggingMiddleware.onError logs
 * what the bus caught, which need not be an Error: reading it must not throw
 * in its turn.
 */
import { runInNewContext } from "vm";
import { LoggingMiddleware } from "../logging.middleware";
import type { CommandMetadata } from "../../base/command.interface";

const metadata: CommandMetadata = { commandId: "c1", timestamp: new Date() };

describe("LoggingMiddleware.before (CB-2)", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs size 0 for an input that JSON cannot represent (undefined)", async () => {
    await expect(
      new LoggingMiddleware().before("NoInput", undefined, metadata),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      "[Command:NoInput] Starting execution",
      expect.objectContaining({ commandId: "c1", inputSize: 0 }),
    );
  });

  it("logs an unknown size for a circular input", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      new LoggingMiddleware().before("Circular", circular, metadata),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      "[Command:Circular] Starting execution",
      expect.objectContaining({ commandId: "c1", inputSize: undefined }),
    );
  });

  it("logs an unknown size for an input holding a BigInt", async () => {
    await expect(
      new LoggingMiddleware().before("Big", { amount: BigInt(1) }, metadata),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      "[Command:Big] Starting execution",
      expect.objectContaining({ inputSize: undefined }),
    );
  });

  it("logs the length of the JSON form for a plain object", async () => {
    await new LoggingMiddleware().before("Plain", { a: 1 }, metadata);

    expect(logSpy).toHaveBeenCalledWith(
      "[Command:Plain] Starting execution",
      expect.objectContaining({ inputSize: 7 }),
    );
  });
});

describe("LoggingMiddleware.onError", () => {
  const INPUT = { email: "alice@example.com" };
  // Not in the input: the text of a thrown value must not be in the line the
  // middleware logs.
  const THROWN_TEXT = "Refused bob@example.com";
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("logs the message and the stack of an Error", async () => {
    const error = new Error("boom");

    await expect(
      new LoggingMiddleware().onError("Failing", INPUT, error, metadata),
    ).resolves.toBeUndefined();

    expect(errorSpy.mock.calls).toStrictEqual([
      [
        "[Command:Failing] Failed with error",
        {
          commandId: "c1",
          userId: undefined,
          error: "boom",
          stack: error.stack,
        },
      ],
    ]);
  });

  // An Error made in another realm is an Error, and is not `instanceof Error`
  // here (see OTHER_REALM_ERRORS in base/__tests__/command-bus.test.ts).
  it("logs the message and the stack of an Error of another realm", async () => {
    const error: unknown = runInNewContext("new RangeError('boom')");
    expect(error instanceof Error).toBe(false);

    await expect(
      new LoggingMiddleware().onError("Failing", INPUT, error, metadata),
    ).resolves.toBeUndefined();

    expect(errorSpy.mock.calls).toStrictEqual([
      [
        "[Command:Failing] Failed with error",
        {
          commandId: "c1",
          userId: undefined,
          error: "boom",
          stack: expect.stringContaining("RangeError: boom"),
        },
      ],
    ]);
  });

  // The bus hands over whatever was thrown.
  it.each([
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["a string", THROWN_TEXT, "string"],
    ["an object with a message", { message: THROWN_TEXT }, "object"],
  ])(
    "logs the kind of %s, never its text, and does not throw",
    async (_case, thrown, kind) => {
      await expect(
        new LoggingMiddleware().onError("Failing", INPUT, thrown, metadata),
      ).resolves.toBeUndefined();

      expect(errorSpy.mock.calls).toStrictEqual([
        [
          "[Command:Failing] Failed with error",
          {
            commandId: "c1",
            userId: undefined,
            error: `Non-Error value thrown: ${kind}`,
            stack: undefined,
          },
        ],
      ]);
    },
  );
});
