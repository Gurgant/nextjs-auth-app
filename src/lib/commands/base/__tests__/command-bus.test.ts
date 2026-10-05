/**
 * @jest-environment node
 *
 * CommandBus: what execute() returns, what it publishes, and how handlers are
 * looked up. The event bus is replaced by a recorder; the middleware is real.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { runInNewContext } from "vm";
import type { ICommand } from "../command.interface";

interface PublishedEvent {
  type: string;
  payload: Record<string, unknown>;
}

const mockPublish = jest.fn(
  async (_event: PublishedEvent): Promise<void> => {},
);
jest.mock("@/lib/events", () => ({
  eventBus: { publish: (event: PublishedEvent) => mockPublish(event) },
}));

import { CommandBus } from "../command-bus";
import { AuditMiddleware } from "../../middleware/audit.middleware";
import { LoggingMiddleware } from "../../middleware/logging.middleware";

interface TokenOutput {
  success: boolean;
  token: string;
  data: { token: string; userId: string };
}

class TokenCommand implements ICommand<Record<string, unknown>, TokenOutput> {
  readonly name = "TokenCommand";
  readonly description = "Returns a token at the top level and inside data";

  async execute(): Promise<TokenOutput> {
    return {
      success: true,
      token: "top-secret",
      data: { token: "nested-secret", userId: "u1" },
    };
  }
}

class NoInputCommand implements ICommand<undefined, string> {
  readonly name = "NoInputCommand";
  readonly description = "Takes no input";

  async execute(): Promise<string> {
    return "done";
  }
}

// Answers a refusal instead of throwing, as the commands of the app do.
class RefusingCommand
  implements ICommand<undefined, { success: boolean; message: string }>
{
  readonly name = "RefusingCommand";
  readonly description = "Answers with success: false";

  async execute(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: "Refused" };
  }
}

// The `name` property differs from the class identifier on purpose.
class ThrowingCommand implements ICommand<Record<string, unknown>, string> {
  readonly name = "FailingCommand";
  readonly description = "Always throws";

  async execute(): Promise<string> {
    throw new Error("boom");
  }
}

// `throw` takes any value, not only an Error. The value is held by the class,
// not passed as input: the failed event carries the input.
const throwing = (thrown: unknown) =>
  class implements ICommand<Record<string, unknown>, string> {
    readonly name = "ThrowingAnything";
    readonly description = "Throws a value that need not be an Error";

    async execute(): Promise<string> {
      throw thrown;
    }
  };

// What can be thrown that is not an Error, each with the kind the bus names.
// The texts are not in the input of the command: none of them may be found in
// the failed event the bus publishes, in the line the logging middleware logs,
// in the entry of the audit middleware, or in the line the bus itself prints
// with `enableLogging` on (the bus of this file has it off; the one of "the
// console line of the bus" has it on).
const THROWN_TEXT = "Refused bob@example.com";
const NOT_ERRORS: [string, unknown, string][] = [
  ["null", null, "null"],
  ["undefined", undefined, "undefined"],
  ["a string", THROWN_TEXT, "string"],
  ["a number", 42, "number"],
  ["a boolean", false, "boolean"],
  ["a bigint", BigInt(7), "bigint"],
  ["a symbol", Symbol(THROWN_TEXT), "symbol"],
  ["a function", () => THROWN_TEXT, "function"],
  ["an object with a message", { message: THROWN_TEXT }, "object"],
];

/** What execute() rejected with: the value itself, whatever it is. */
async function thrownBy(run: Promise<unknown>): Promise<unknown> {
  let caught: unknown = "execute() did not throw";
  try {
    await run;
  } catch (thrown) {
    caught = thrown;
  }
  return caught;
}

/** What a call threw: the value itself. */
function thrownBySync(call: () => unknown): unknown {
  try {
    call();
  } catch (thrown) {
    return thrown;
  }
  return "the call did not throw";
}

// An Error of another realm is an Error, and is not `instanceof Error` here:
// one made in another vm context and, under Jest, one that Node itself makes
// for a failed `fs` call. Each with its message.
const NO_SUCH_FILE = join(__dirname, "no-such-file");
const OTHER_REALM_ERRORS: [string, unknown, string][] = [
  [
    "made in another vm context",
    runInNewContext("new RangeError('boom')"),
    "boom",
  ],
  [
    "made by Node itself (fs)",
    thrownBySync(() => readFileSync(NO_SUCH_FILE)),
    `ENOENT: no such file or directory, open '${NO_SUCH_FILE}'`,
  ],
];

// Two different classes with the SAME class name, which is what a minifier
// can produce in two scopes. Only the `name` property tells them apart.
const makeCommand = (label: string) =>
  class Cmd implements ICommand<undefined, string> {
    readonly name = label;
    readonly description = `Command ${label}`;

    async execute(): Promise<string> {
      return label;
    }
  };

function publishedEvent(type: string): PublishedEvent {
  const event = mockPublish.mock.calls
    .map(([published]) => published)
    .find((published) => published.type === type);
  if (!event) {
    throw new Error(`No ${type} event was published`);
  }
  return event;
}

describe("CommandBus", () => {
  let bus: CommandBus;

  beforeEach(() => {
    mockPublish.mockClear();
    bus = new CommandBus({ enableLogging: false });
  });

  describe("sanitising (CB-1)", () => {
    it("execute() returns the command output untouched", async () => {
      bus.register(TokenCommand);

      const out = await bus.execute(TokenCommand, { password: "Plain123!" });

      expect(out.data.token).toBe("nested-secret");
      expect(out.token).toBe("top-secret");
    });

    it("publishes the executed event with input and output redacted", async () => {
      bus.register(TokenCommand);

      await bus.execute(TokenCommand, {
        email: "alice@example.com",
        password: "Plain123!",
      });

      const { payload } = publishedEvent("system.command_executed");
      expect(payload.output).toEqual({
        success: true,
        token: "[REDACTED]",
        data: { token: "[REDACTED]", userId: "u1" },
      });
      expect(payload.input).toEqual({
        email: "alice@example.com",
        password: "[REDACTED]",
      });
    });

    it("publishes the failed event with the input redacted", async () => {
      bus.register(ThrowingCommand);

      await expect(
        bus.execute(ThrowingCommand, {
          email: "alice@example.com",
          password: "Plain123!",
        }),
      ).rejects.toThrow("boom");

      const { payload } = publishedEvent("system.command_failed");
      expect(payload.input).toEqual({
        email: "alice@example.com",
        password: "[REDACTED]",
      });
      expect(payload.commandName).toBe("FailingCommand");
      expect(payload.error).toBe("boom");
    });

    it("gives the caller the real token while the audit entry keeps no input, output or request data", async () => {
      const audit = new AuditMiddleware();
      bus.use(audit);
      bus.register(TokenCommand);

      const out = await bus.execute(
        TokenCommand,
        { email: "alice@example.com", password: "Plain123!" },
        {
          userId: "u1",
          locale: "de",
          ipAddress: "203.0.113.9",
          userAgent: "Client-Chosen-Agent/1.0",
        },
      );

      expect(out.data.token).toBe("nested-secret");
      expect(audit.getAuditLogs()).toStrictEqual([
        {
          commandName: "TokenCommand",
          commandId: publishedEvent("system.command_executed").payload
            .commandId,
          userId: "u1",
          timestamp: expect.any(Date),
          duration: expect.any(Number),
          success: true,
        },
      ]);
    });
  });

  describe("outcome of a command", () => {
    it("the executed event says success only when the command's answer does", async () => {
      bus.registerMany([TokenCommand, RefusingCommand, NoInputCommand]);

      await bus.execute(TokenCommand, {});
      await bus.execute(RefusingCommand, undefined);
      await bus.execute(NoInputCommand, undefined);

      expect(
        mockPublish.mock.calls
          .map(([event]) => event)
          .filter((event) => event.type === "system.command_executed")
          .map(({ payload }) => [payload.commandName, payload.success]),
      ).toEqual([
        ["TokenCommand", true],
        ["RefusingCommand", false],
        // An answer without a `success` field does not say success.
        ["NoInputCommand", false],
      ]);
    });

    it("the audit entry says the same outcome, and names the class of a thrown error", async () => {
      const audit = new AuditMiddleware();
      bus.use(audit);
      bus.registerMany([
        TokenCommand,
        RefusingCommand,
        NoInputCommand,
        ThrowingCommand,
      ]);

      await bus.execute(TokenCommand, {});
      await bus.execute(RefusingCommand, undefined);
      await bus.execute(NoInputCommand, undefined);
      await expect(bus.execute(ThrowingCommand, {})).rejects.toThrow("boom");

      expect(
        audit
          .getAuditLogs()
          .map(({ commandName, success, errorType }) => [
            commandName,
            success,
            errorType,
          ]),
      ).toEqual([
        ["TokenCommand", true, undefined],
        ["RefusingCommand", false, undefined],
        ["NoInputCommand", false, undefined],
        ["FailingCommand", false, "Error"],
      ]);
    });

    it("a step that fails after the command returned adds a second entry for the same command id", async () => {
      const audit = new AuditMiddleware();
      bus.use(audit);
      bus.register(TokenCommand);
      // Publishing the executed event fails; the failed event is published.
      mockPublish.mockRejectedValueOnce(new TypeError("late"));

      await expect(bus.execute(TokenCommand, {})).rejects.toThrow("late");

      const { commandId } = publishedEvent("system.command_failed").payload;
      expect(audit.getAuditLogs()).toStrictEqual([
        // What the command answered ...
        {
          commandName: "TokenCommand",
          commandId,
          userId: undefined,
          timestamp: expect.any(Date),
          duration: expect.any(Number),
          success: true,
        },
        // ... then what the bus caught: not thrown by the command.
        {
          commandName: "TokenCommand",
          commandId,
          userId: undefined,
          timestamp: expect.any(Date),
          success: false,
          errorType: "TypeError",
        },
      ]);
    });
  });

  describe("what a command threw", () => {
    const INPUT = { email: "alice@example.com", password: "Plain123!" };
    let errorSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("an Error: rethrown as the same object, published with its message and stack", async () => {
      const error = new Error("boom");
      const Command = throwing(error);
      bus.register(Command);

      expect(await thrownBy(bus.execute(Command, INPUT))).toBe(error);

      expect(publishedEvent("system.command_failed").payload).toStrictEqual({
        commandName: "ThrowingAnything",
        commandId: expect.any(String),
        error: "boom",
        errorStack: error.stack,
        input: { email: "alice@example.com", password: "[REDACTED]" },
        failedAt: expect.any(Date),
      });
    });

    // An Error by its prototype chain only, as a constructor function written
    // without `class` makes them: `instanceof Error`, and not a native Error.
    it("an Error by its prototype chain only: rethrown as the same object, published with its message", async () => {
      const error: unknown = Object.assign(Object.create(Error.prototype), {
        message: "boom",
      });
      const Command = throwing(error);
      bus.register(Command);

      expect(await thrownBy(bus.execute(Command, INPUT))).toBe(error);

      expect(publishedEvent("system.command_failed").payload.error).toBe(
        "boom",
      );
    });

    it.each(OTHER_REALM_ERRORS)(
      "an Error %s: rethrown as the same object, published with its message and stack",
      async (_case, error, message) => {
        expect(error instanceof Error).toBe(false);
        const Command = throwing(error);
        bus.register(Command);

        expect(await thrownBy(bus.execute(Command, INPUT))).toBe(error);

        expect(publishedEvent("system.command_failed").payload).toStrictEqual({
          commandName: "ThrowingAnything",
          commandId: expect.any(String),
          error: message,
          errorStack: expect.stringContaining(message),
          input: { email: "alice@example.com", password: "[REDACTED]" },
          failedAt: expect.any(Date),
        });
      },
    );

    it.each(NOT_ERRORS)(
      "%s: rethrown as it is, published with its kind and never its text",
      async (_case, thrown, kind) => {
        const Command = throwing(thrown);
        bus.register(Command);

        expect(await thrownBy(bus.execute(Command, INPUT))).toBe(thrown);

        expect(publishedEvent("system.command_failed").payload).toStrictEqual({
          commandName: "ThrowingAnything",
          commandId: expect.any(String),
          error: `Non-Error value thrown: ${kind}`,
          errorStack: undefined,
          input: { email: "alice@example.com", password: "[REDACTED]" },
          failedAt: expect.any(Date),
        });
      },
    );

    // Both are in the pipeline of the app in development. The logging
    // middleware reads what was thrown as well, before the bus publishes the
    // failed event.
    it.each(NOT_ERRORS)(
      "%s: the same with the logging and the audit middleware in the pipeline",
      async (_case, thrown, kind) => {
        const audit = new AuditMiddleware();
        bus.use(new LoggingMiddleware());
        bus.use(audit);
        const Command = throwing(thrown);
        bus.register(Command);

        expect(await thrownBy(bus.execute(Command, INPUT))).toBe(thrown);

        const { payload } = publishedEvent("system.command_failed");
        expect(payload.error).toBe(`Non-Error value thrown: ${kind}`);
        expect(errorSpy.mock.calls).toStrictEqual([
          [
            "[Command:ThrowingAnything] Failed with error",
            {
              commandId: payload.commandId,
              userId: undefined,
              error: `Non-Error value thrown: ${kind}`,
              stack: undefined,
            },
          ],
        ]);
        // The audit entry names what was thrown as the failed event does.
        expect(
          audit
            .getAuditLogs()
            .map(({ commandId, success, errorType }) => [
              commandId,
              success,
              errorType,
            ]),
        ).toEqual([[payload.commandId, false, payload.error]]);
      },
    );
  });

  // In development the bus prints a line of its own for a failed command,
  // directly after the line of the logging middleware.
  describe("the console line of the bus (enableLogging)", () => {
    const INPUT = { email: "alice@example.com", password: "Plain123!" };
    const LINE = "[CommandBus] Error executing ThrowingAnything:";
    let errorSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;
    let loggingBus: CommandBus;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      // The bus also prints each command it registers.
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      loggingBus = new CommandBus({ enableLogging: true });
    });

    afterEach(() => {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("an Error: printed as it is", async () => {
      const error = new Error("boom");
      const Command = throwing(error);
      loggingBus.register(Command);

      expect(await thrownBy(loggingBus.execute(Command, INPUT))).toBe(error);

      expect(errorSpy.mock.calls).toEqual([[LINE, error]]);
      expect(errorSpy.mock.calls[0][1]).toBe(error);
    });

    it.each(OTHER_REALM_ERRORS)(
      "an Error %s: printed as it is",
      async (_case, error) => {
        const Command = throwing(error);
        loggingBus.register(Command);

        expect(await thrownBy(loggingBus.execute(Command, INPUT))).toBe(error);

        expect(errorSpy.mock.calls).toHaveLength(1);
        expect(errorSpy.mock.calls[0][0]).toBe(LINE);
        expect(errorSpy.mock.calls[0][1]).toBe(error);
      },
    );

    it.each(NOT_ERRORS)(
      "%s: printed by its kind, never as the value itself",
      async (_case, thrown, kind) => {
        const Command = throwing(thrown);
        loggingBus.register(Command);

        expect(await thrownBy(loggingBus.execute(Command, INPUT))).toBe(thrown);

        expect(errorSpy.mock.calls).toStrictEqual([
          [LINE, `Non-Error value thrown: ${kind}`],
        ]);
      },
    );

    // The two lines of a failed command in development, in their order.
    it("a string: the line of the logging middleware and the line of the bus say the same", async () => {
      loggingBus.use(new LoggingMiddleware());
      const Command = throwing(THROWN_TEXT);
      loggingBus.register(Command);

      expect(await thrownBy(loggingBus.execute(Command, INPUT))).toBe(
        THROWN_TEXT,
      );

      expect(errorSpy.mock.calls).toStrictEqual([
        [
          "[Command:ThrowingAnything] Failed with error",
          {
            commandId: expect.any(String),
            userId: undefined,
            error: "Non-Error value thrown: string",
            stack: undefined,
          },
        ],
        [LINE, "Non-Error value thrown: string"],
      ]);
    });
  });

  describe("logging middleware (CB-2)", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("runs a command that takes no input", async () => {
      bus.use(new LoggingMiddleware());
      bus.register(NoInputCommand);

      await expect(bus.execute(NoInputCommand, undefined)).resolves.toBe(
        "done",
      );
    });

    it("logs the outcome that the executed event publishes", async () => {
      bus.use(new LoggingMiddleware());
      bus.registerMany([TokenCommand, RefusingCommand, NoInputCommand]);

      await bus.execute(TokenCommand, {});
      await bus.execute(RefusingCommand, undefined);
      await bus.execute(NoInputCommand, undefined);

      // The line says "Completed" for every command that returned: whether it
      // succeeded is in the `success` field.
      const logged = logSpy.mock.calls
        .filter(([line]) => String(line).includes("Completed"))
        .map(([line, fields]) => [line, fields.success]);
      const published = mockPublish.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === "system.command_executed")
        .map(({ payload }) => payload.success);
      expect(logged).toEqual([
        ["[Command:TokenCommand] Completed", true],
        ["[Command:RefusingCommand] Completed", false],
        ["[Command:NoInputCommand] Completed", false],
      ]);
      expect(logged.map(([, success]) => success)).toEqual(published);
    });
  });

  describe("handler lookup (CB-8)", () => {
    const A = makeCommand("A");
    const B = makeCommand("B");

    it("keeps two command classes that share a class name apart", async () => {
      expect(A.name).toBe(B.name); // precondition: same class identifier
      bus.registerMany([A, B]);

      await expect(bus.execute(A, undefined)).resolves.toBe("A");
      await expect(bus.execute(B, undefined)).resolves.toBe("B");
    });

    it("names the command after its `name` property, not the class identifier", async () => {
      const audit = new AuditMiddleware();
      bus.use(audit);
      bus.registerMany([A, B]);

      await bus.execute(A, undefined);

      expect(
        publishedEvent("system.command_executed").payload.commandName,
      ).toBe("A");
      expect(audit.getAuditLogs()[0].commandName).toBe("A");
      expect(bus.getRegisteredCommands()).toEqual(["A", "B"]);
    });

    it("knows which classes are registered", () => {
      bus.register(A);

      expect(bus.hasCommand(A)).toBe(true);
      expect(bus.hasCommand(B)).toBe(false);
    });

    it("refuses a command class that was never registered", async () => {
      await expect(bus.execute(NoInputCommand, undefined)).rejects.toThrow(
        "No handler registered for command: NoInputCommand",
      );
    });
  });
});
