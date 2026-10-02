/**
 * @jest-environment node
 *
 * LoggingMiddleware.before measures the input for a log line; an input that
 * has no JSON form must not abort the command.
 */
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
