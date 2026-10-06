/**
 * @jest-environment node
 *
 * The events layer as the application runs it: the real bus with its two
 * listeners, the audit log and the analytics counters. The tests publish the
 * five events the application publishes, or run a registration through the
 * real command bus; only the user repository is replaced. The listeners live
 * in module variables, so each test loads a fresh copy of the layer. The bus
 * starts its listeners without waiting for them: every check first lets them
 * run.
 */
import type { IEvent } from "@/lib/events";

const mockRepo = {
  findByEmail: jest.fn(),
  createWithAccount: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

interface Layer {
  events: typeof import("@/lib/events");
  commands: typeof import("@/lib/commands");
}

/** A fresh events layer, and a command bus that publishes into it. */
function loadLayer(): Layer {
  let layer: Layer | undefined;
  jest.isolateModules(() => {
    layer = {
      events: require("@/lib/events"),
      commands: require("@/lib/commands"),
    };
  });
  return layer!;
}

/** One turn of the event loop: the listeners the bus started have run. */
const listenersRan = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

// What a client can put into the metadata of an event. Both values come from
// the request, not from form fields: the User-Agent header and, unless a
// trusted proxy overwrites X-Forwarded-For, the client IP. The listeners keep
// neither field.
const CLIENT_METADATA = {
  ipAddress: "203.0.113.9",
  userAgent: "Client-Chosen-Agent/1.0",
};

/** The audit entry expected for `event`: its ids and time, and `fields`. */
function auditEntryOf(
  event: IEvent,
  fields: {
    action: string;
    details: Record<string, unknown>;
    severity: string;
  },
) {
  return {
    id: expect.any(String),
    timestamp: event.metadata.timestamp,
    eventType: event.type,
    eventId: event.metadata.eventId,
    userId: event.metadata.userId,
    ...fields,
  };
}

const NOTHING_COUNTED = {
  counters: {},
  gauges: {},
  recentMetrics: [],
  totals: { registrations: 0, commands: 0 },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("each published event reaches both listeners", () => {
  let events: Layer["events"];

  beforeEach(() => {
    ({ events } = loadLayer());
  });

  async function publish(event: IEvent): Promise<void> {
    await events.eventBus.publish(event);
    await listenersRan();
  }

  it("user.registered: the user id and the provider, no address and no name", async () => {
    const event = new events.UserRegisteredEvent(
      {
        userId: "user-1",
        email: "alice@example.com",
        name: "Alice Example",
        provider: "credentials",
        emailVerified: false,
        registeredAt: new Date(),
      },
      { userId: "user-1", ...CLIENT_METADATA },
    );

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "User Registration",
        details: { provider: "credentials" },
        severity: "info",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual({
      counters: { "users.registered": 1 },
      gauges: {},
      recentMetrics: [
        {
          name: "user_registration",
          value: 1,
          tags: { provider: "credentials" },
          timestamp: expect.any(Date),
        },
      ],
      totals: { registrations: 1, commands: 0 },
    });
  });

  it("user.password_changed", async () => {
    const event = new events.PasswordChangedEvent(
      { userId: "user-1", changedAt: new Date(), requiresLogout: true },
      { userId: "user-1", ...CLIENT_METADATA },
    );

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "Password Changed",
        details: { requiresLogout: true },
        severity: "warning",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual({
      counters: { "users.password_changed": 1 },
      gauges: {},
      recentMetrics: [
        {
          name: "password_change",
          value: 1,
          tags: {},
          timestamp: expect.any(Date),
        },
      ],
      totals: { registrations: 0, commands: 0 },
    });
  });

  it("system.command_executed: outcome and duration, not the input", async () => {
    const event = new events.CommandExecutedEvent(
      {
        commandName: "RegisterUserCommand",
        commandId: "command-1",
        input: {
          name: "Alice Example",
          email: "alice@example.com",
          password: "[REDACTED]",
        },
        output: { success: true, message: "Created", data: { id: "user-1" } },
        success: true,
        duration: 12,
        executedAt: new Date(),
      },
      { userId: "user-1", ...CLIENT_METADATA },
    );

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "Command: RegisterUserCommand",
        details: { success: true, duration: 12 },
        severity: "info",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual({
      counters: {
        "commands.executed": 1,
        "commands.RegisterUserCommand": 1,
      },
      gauges: { "command.RegisterUserCommand.avg_duration": 12 },
      recentMetrics: [
        {
          name: "command_duration",
          value: 12,
          tags: { command: "RegisterUserCommand", success: "true" },
          timestamp: expect.any(Date),
        },
      ],
      totals: { registrations: 0, commands: 1 },
    });
  });

  it("the average duration of a command counts each run once", async () => {
    const run = (commandId: string, duration: number) =>
      new events.CommandExecutedEvent(
        {
          commandName: "RegisterUserCommand",
          commandId,
          input: {},
          output: { success: true },
          success: true,
          duration,
          executedAt: new Date(),
        },
        { userId: "user-1" },
      );

    await publish(run("command-1", 12));
    await publish(run("command-2", 20));

    expect(events.getAnalyticsSummary().gauges).toStrictEqual({
      "command.RegisterUserCommand.avg_duration": 16,
    });
  });

  it("system.command_failed: the command name, not the error text", async () => {
    const event = new events.CommandFailedEvent(
      {
        commandName: "RegisterUserCommand",
        commandId: "command-2",
        error: "Refused alice@example.com",
        errorStack: "Error: Refused alice@example.com\n    at execute",
        input: { email: "alice@example.com", password: "[REDACTED]" },
        failedAt: new Date(),
      },
      { userId: "user-1", ...CLIENT_METADATA },
    );

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "Command Failed: RegisterUserCommand",
        details: {},
        severity: "error",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual(NOTHING_COUNTED);
  });

  it("system.error_occurred: the error type and code, not its message or context", async () => {
    const event = new events.ErrorOccurredEvent(
      {
        errorType: "ResourceAlreadyExistsError",
        message: "User alice@example.com already exists",
        stack:
          "ResourceAlreadyExistsError: User already exists\n    at execute",
        context: {
          email: "alice@example.com",
          code: "BIZ_1303",
          category: "business",
        },
        severity: "low",
        occurredAt: new Date(),
      },
      { userId: "user-1", ...CLIENT_METADATA },
    );

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "System Error",
        details: { errorType: "ResourceAlreadyExistsError", code: "BIZ_1303" },
        severity: "low",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual(NOTHING_COUNTED);
  });

  it("an event no listener knows: its type, none of its data", async () => {
    const event: IEvent<{ userId: string; token: string }> = {
      type: "example.token_issued",
      payload: { userId: "user-1", token: "one-time-token-5521" },
      metadata: {
        eventId: "event-1",
        timestamp: new Date(),
        userId: "user-1",
        ...CLIENT_METADATA,
      },
    };

    await publish(event);

    expect(events.getAuditLogs()).toStrictEqual([
      auditEntryOf(event, {
        action: "example.token_issued",
        details: {},
        severity: "info",
      }),
    ]);
    expect(events.getAnalyticsSummary()).toStrictEqual(NOTHING_COUNTED);
  });
});

describe("the listeners keep a bounded number of entries", () => {
  it("the audit log keeps the newest entries up to its limit", async () => {
    const { events } = loadLayer();
    const audit = new events.AuditLogHandler(3);

    for (const userId of ["user-1", "user-2", "user-3", "user-4"]) {
      await audit.handle(
        new events.PasswordChangedEvent(
          { userId, changedAt: new Date() },
          { userId },
        ),
      );
    }

    expect(audit.getAuditLogs().map((entry) => entry.userId)).toEqual([
      "user-2",
      "user-3",
      "user-4",
    ]);
  });

  it("the listeners of the layer keep 10,000 entries each", async () => {
    const { events } = loadLayer();

    for (let index = 0; index <= 10_000; index++) {
      const userId = `user-${index}`;
      await events.eventBus.publish(
        new events.PasswordChangedEvent(
          { userId, changedAt: new Date() },
          { userId },
        ),
      );
    }
    await listenersRan();

    const auditLogs = events.getAuditLogs();
    expect(auditLogs).toHaveLength(10_000);
    expect(auditLogs[0].userId).toBe("user-1");
    expect(
      events.getAnalyticsHandler().getMetrics(new Date(0), new Date()),
    ).toHaveLength(10_000);
  });
});

describe("what the audit listener prints to the server console", () => {
  const env = process.env as Record<string, string>;

  // The details printed are the entry's: no error text. The critical error
  // is made by hand: the errors layer has no critical error (see
  // docs/ARCHITECTURE.md), so its type and code are names that no real error
  // has.
  const PRINTED_ERRORS = [
    ["[AUDIT] ERROR: Command Failed: RegisterUserCommand", {}],
    [
      "[AUDIT] CRITICAL: System Error",
      { errorType: "ExampleCriticalError", code: "EXAMPLE_0001" },
    ],
  ];

  /**
   * The [AUDIT] lines printed while a password change, a command that threw
   * and a critical error are handled under `nodeEnv`.
   */
  async function auditLinesUnder(nodeEnv: string) {
    jest.replaceProperty(env, "NODE_ENV", nodeEnv);
    const { events } = loadLayer();

    await events.eventBus.publish(
      new events.PasswordChangedEvent(
        { userId: "user-1", changedAt: new Date() },
        { userId: "user-1" },
      ),
    );
    await events.eventBus.publish(
      new events.CommandFailedEvent(
        {
          commandName: "RegisterUserCommand",
          commandId: "command-3",
          error: "Refused alice@example.com",
          input: {},
          failedAt: new Date(),
        },
        { userId: "user-1" },
      ),
    );
    await events.eventBus.publish(
      new events.ErrorOccurredEvent(
        {
          errorType: "ExampleCriticalError",
          message: "No answer for alice@example.com",
          context: { email: "alice@example.com", code: "EXAMPLE_0001" },
          severity: "critical",
          occurredAt: new Date(),
        },
        { userId: "user-1" },
      ),
    );
    await listenersRan();

    const auditCalls = (method: "error" | "log") =>
      jest
        .mocked(console[method])
        .mock.calls.filter(([line]) => String(line).startsWith("[AUDIT]"));
    return {
      errors: auditCalls("error").map(([line, fields]) => [
        line,
        fields.details,
      ]),
      logs: auditCalls("log").map(([line]) => line),
    };
  }

  it("errors and critical errors in every environment", async () => {
    expect(await auditLinesUnder("production")).toEqual({
      errors: PRINTED_ERRORS,
      logs: [],
    });
  });

  it("the other entries in development only", async () => {
    expect(await auditLinesUnder("development")).toEqual({
      errors: PRINTED_ERRORS,
      logs: ["[AUDIT] Password Changed"],
    });
  });
});

interface ReachableGraph {
  /** every string the walk found, with the path that leads to it */
  strings: Array<{ path: string; value: string }>;
  /** every object and function the walk visited */
  objects: object[];
}

// The walk of src/lib/commands/__tests__/no-retained-secrets.test.ts: own
// properties (TypeScript-private fields included) and Map and Set entries, of
// objects and functions alike. It does not follow prototype chains or
// variables captured by a closure, so a listener attached as a function could
// keep every event unseen: heldBy() also requires the bus to have exactly the
// two listener objects, whose fields the walk reads.
function reachableFrom(root: unknown): ReachableGraph {
  const graph: ReachableGraph = { strings: [], objects: [] };
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      graph.strings.push({ path, value });
      return;
    }
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      seen.has(value)
    ) {
      return;
    }
    seen.add(value);
    graph.objects.push(value);

    if (value instanceof Map) {
      let index = 0;
      for (const [key, entry] of value) {
        visit(key, `${path}<key ${index}>`);
        visit(entry, `${path}<value ${index}>`);
        index++;
      }
    } else if (value instanceof Set) {
      let index = 0;
      for (const entry of value) {
        visit(entry, `${path}<item ${index}>`);
        index++;
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      visit(Reflect.get(value, key), `${path}.${String(key)}`);
    }
  };

  visit(root, "events");
  return graph;
}

describe("a registration through the real command bus", () => {
  const userId = "events-user-31";
  const email = "events.alice@example.com";
  const name = "Alice Events-Example";
  const password = "Events-Secret-6612!";
  const previousRounds = process.env.BCRYPT_ROUNDS;

  beforeEach(() => {
    process.env.BCRYPT_ROUNDS = "4";
  });

  afterEach(() => {
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  async function register(confirmPassword: string) {
    const { events, commands } = loadLayer();
    const answer = await commands.commandBus.execute(
      commands.RegisterUserCommand,
      { name, email, password, confirmPassword },
    );
    await listenersRan();
    return { events, answer };
  }

  /**
   * Every string the events layer holds: the module and everything reachable
   * from it, and what its two read functions return.
   */
  function heldBy(events: Layer["events"]) {
    // Any other listener, a function included, fails here until it is
    // reviewed: the walk cannot see what a function keeps. For the same
    // reason neither publish nor a listener's handle may be replaced by a
    // function of its own.
    const handlers = events.eventBus
      .getSubscriptions()
      .map(({ handler }) => handler);
    expect(handlers).toEqual([
      expect.any(events.AuditLogHandler),
      expect.any(events.AnalyticsHandler),
    ]);
    expect(Object.hasOwn(events.eventBus, "publish")).toBe(false);
    for (const handler of handlers) {
      expect(Object.hasOwn(handler, "handle")).toBe(false);
    }
    const graph = reachableFrom({
      layer: events,
      auditLogs: events.getAuditLogs(),
      analytics: events.getAnalyticsSummary(),
    });
    // The walk must reach both listeners and this registration's entries, or
    // the checks below would pass without having looked at them.
    expect(
      graph.objects.some((object) => object instanceof events.AuditLogHandler),
    ).toBe(true);
    expect(
      graph.objects.some((object) => object instanceof events.AnalyticsHandler),
    ).toBe(true);
    expect(
      graph.strings.some(
        ({ value }) => value === "Command: RegisterUserCommand",
      ),
    ).toBe(true);
    return (needle: string) =>
      graph.strings
        .filter(({ value }) => value.includes(needle))
        .map(({ path }) => path);
  }

  /** What the two listeners recorded, entry by entry. */
  function recorded(events: Layer["events"]) {
    return {
      audit: events
        .getAuditLogs()
        .map(({ action, details }) => ({ action, details })),
      commandMetrics: events
        .getAnalyticsSummary()
        .recentMetrics.filter((metric) => metric.name === "command_duration")
        .map((metric) => metric.tags),
    };
  }

  it("accepted: the layer keeps the user id, not the address or the name", async () => {
    mockRepo.findByEmail.mockResolvedValue(null);
    mockRepo.createWithAccount.mockResolvedValue({ id: userId, email, name });
    mockRepo.update.mockResolvedValue({ id: userId });

    const { events, answer } = await register(password);

    expect(answer.success).toBe(true);
    const pathsHolding = heldBy(events);
    expect(pathsHolding(userId)).not.toEqual([]);
    expect(pathsHolding(email)).toEqual([]);
    expect(pathsHolding(name)).toEqual([]);
    expect(recorded(events)).toEqual({
      audit: [
        { action: "User Registration", details: { provider: "credentials" } },
        {
          action: "Command: RegisterUserCommand",
          details: { success: true, duration: expect.any(Number) },
        },
      ],
      commandMetrics: [{ command: "RegisterUserCommand", success: "true" }],
    });
  });

  it("refused, the address is taken: recorded as not successful, without the address", async () => {
    mockRepo.findByEmail.mockResolvedValue({ id: "existing-user", email });

    const { events, answer } = await register(password);

    expect(answer.success).toBe(false);
    expect(mockRepo.createWithAccount).not.toHaveBeenCalled();
    const pathsHolding = heldBy(events);
    expect(pathsHolding(email)).toEqual([]);
    expect(pathsHolding(name)).toEqual([]);
    expect(recorded(events)).toEqual({
      audit: [
        {
          action: "System Error",
          details: {
            errorType: "ResourceAlreadyExistsError",
            code: "BIZ_1303",
          },
        },
        {
          action: "Command: RegisterUserCommand",
          details: { success: false, duration: expect.any(Number) },
        },
      ],
      commandMetrics: [{ command: "RegisterUserCommand", success: "false" }],
    });
  });

  it("refused, the passwords differ: recorded as not successful, without the address", async () => {
    const { events, answer } = await register("Mismatch-Secret-6612!");

    expect(answer.success).toBe(false);
    // Refused before the repository is asked.
    expect(mockRepo.findByEmail).not.toHaveBeenCalled();
    const pathsHolding = heldBy(events);
    expect(pathsHolding(email)).toEqual([]);
    expect(pathsHolding(name)).toEqual([]);
    expect(recorded(events)).toEqual({
      audit: [
        {
          action: "System Error",
          details: { errorType: "ValidationError", code: "VAL_1200" },
        },
        {
          action: "Command: RegisterUserCommand",
          details: { success: false, duration: expect.any(Number) },
        },
      ],
      commandMetrics: [{ command: "RegisterUserCommand", success: "false" }],
    });
  });
});
