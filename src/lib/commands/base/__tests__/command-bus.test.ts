/**
 * @jest-environment node
 *
 * CommandBus: what execute() returns, what it publishes, and how handlers are
 * looked up. The event bus is replaced by a recorder; the middleware is real.
 */
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

    it("gives the caller the real token while the audit entry is redacted", async () => {
      const audit = new AuditMiddleware();
      bus.use(audit);
      bus.register(TokenCommand);

      const out = await bus.execute(TokenCommand, {});

      expect(out.data.token).toBe("nested-secret");
      expect(audit.getAuditLogs()).toHaveLength(1);
      expect(audit.getAuditLogs()[0].output).toEqual({
        success: true,
        token: "[REDACTED]",
        data: { token: "[REDACTED]", userId: "u1" },
      });
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

      const logged = logSpy.mock.calls
        .filter(([line]) => String(line).endsWith("Completed successfully"))
        .map(([, fields]) => fields.success);
      const published = mockPublish.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === "system.command_executed")
        .map(({ payload }) => payload.success);
      expect(logged).toEqual([true, false, false]);
      expect(logged).toEqual(published);
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
