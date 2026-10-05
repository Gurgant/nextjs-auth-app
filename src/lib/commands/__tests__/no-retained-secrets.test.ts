/**
 * @jest-environment node
 *
 * After execute() neither a plain-text password nor the personal data of the
 * request (e-mail address, name, client IP, User-Agent) nor its locale can be
 * reached from the command bus: not in its audit list, not on the (shared)
 * handler instance, not anywhere else on the bus. What stays is the audit
 * entry (command name, ids, time, duration, outcome). On the handler nothing
 * of a run stays, not even its id: two executions of one handler can overlap
 * (see base/__tests__/command.base.test.ts).
 * The production bus (`commandBus`, with its real middleware) is used, with
 * the metadata the actions hand it; the repository and the event bus are
 * mocked. The check walks what it can reach from the bus through own
 * properties (TypeScript-private fields included) and through Map and Set
 * entries, objects and functions alike: that includes the command classes the
 * handlers map is keyed by, their statics and their prototype objects. It does
 * not follow prototype chains or variables captured by a closure.
 */
const mockRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createWithAccount: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import bcrypt from "bcryptjs";
import {
  commandBus,
  AuditMiddleware,
  RegisterUserCommand,
  ChangePasswordCommand,
} from "@/lib/commands";

interface ReachableGraph {
  /** every string the walk found, with the path that leads to it */
  strings: Array<{ path: string; value: string }>;
  /** every object and function the walk visited (limits: see the header) */
  objects: object[];
}

function reachableFrom(root: unknown): ReachableGraph {
  const graph: ReachableGraph = { strings: [], objects: [] };
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      graph.strings.push({ path, value });
      return;
    }
    // Functions are walked like objects: the handlers map is keyed by the
    // command classes, and a class can hold a value in a static.
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

  visit(root, "bus");
  return graph;
}

/**
 * The one handler of `CommandClass`. The walk must reach the class the
 * handlers map is keyed by and that handler, or the checks on what the bus
 * holds would pass without having looked at them.
 */
function handlerOf<T extends object>(
  { objects }: ReachableGraph,
  CommandClass: new () => T,
): T {
  expect(objects.includes(CommandClass)).toBe(true);
  const handlers = objects.filter(
    (object): object is T => object instanceof CommandClass,
  );
  expect(handlers).toHaveLength(1);
  return handlers[0];
}

/**
 * The audit entry of the newest execution. The walk must go through the audit
 * list of the bus and through that entry, or the checks on what the bus holds
 * would pass without having looked there.
 */
function newestAuditEntry({ objects }: ReachableGraph) {
  const audits = objects.filter(
    (object): object is AuditMiddleware => object instanceof AuditMiddleware,
  );
  expect(audits).toHaveLength(1);
  const entries = audits[0].getAuditLogs();
  const entry = entries[entries.length - 1];
  expect(objects.includes(entries)).toBe(true);
  expect(objects.includes(entry)).toBe(true);
  return entry;
}

/**
 * What the bus holds after its newest execution, which was of `CommandClass`:
 * the audit entry, the own fields of the shared handler, and for each needle
 * the paths of the strings that contain it. `commandId` and `commandName` are
 * controls, strings the walk has to find: the id of the execution in the
 * audit entry, and nowhere else, and the name of the command in an audit
 * entry (the list also holds the entries of the executions before this one).
 */
function heldByBus<T extends object>(
  CommandClass: new () => T,
  needles: Record<string, string>,
) {
  const graph = reachableFrom(commandBus);
  const entry = newestAuditEntry(graph);
  const handler = handlerOf(graph, CommandClass);
  return {
    entry,
    handler: { ...handler },
    paths: Object.fromEntries(
      Object.entries({
        commandId: entry.commandId,
        commandName: entry.commandName,
        ...needles,
      }).map(([label, needle]) => [
        label,
        graph.strings
          .filter(({ value }) => value.includes(needle))
          .map(({ path }) => path),
      ]),
    ),
  };
}

const IN_THE_AUDIT_ENTRY = /^bus\.middleware\.\d+\.auditLogs\.\d+\./;
// The command name is also the `name` of the handler and of its class: what
// counts is that the walk finds it in the audit list as well.
const THE_NAME_IN_AN_AUDIT_ENTRY = expect.arrayContaining([
  expect.stringMatching(/^bus\.middleware\.\d+\.auditLogs\.\d+\.commandName$/),
]);

// What an action takes from the request for the command metadata (see
// requestMetadata in src/lib/security.ts).
const CLIENT_IP = "203.0.113.9";
const USER_AGENT = "Client-Chosen-Agent/1.0";
// Not a locale of the app: a value the walk can look for, which "de" is not.
// The commands do not check the locale, they hand it on to the events.
const LOCALE = "de-x-retained";
const REQUEST_METADATA = {
  locale: LOCALE,
  ipAddress: CLIENT_IP,
  userAgent: USER_AGENT,
};

describe("no password and no personal data of the request is retained after execute()", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;

  beforeEach(() => {
    process.env.BCRYPT_ROUNDS = "4";
    // Reset, not clear: an implementation set by one test must not reach the
    // next one. Every test sets the repository answers it needs.
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  describe("registration", () => {
    const name = "Alice Retained-Example";
    const email = "retained.register@example.com";
    const password = "Register-Secret-9173!";
    const mismatch = "Mismatch-Secret-5521!";

    const register = (confirmPassword: string) =>
      commandBus.execute(
        RegisterUserCommand,
        { name, email, password, confirmPassword, locale: LOCALE },
        REQUEST_METADATA,
      );

    const heldAfterRegistration = () =>
      heldByBus(RegisterUserCommand, {
        password,
        mismatch,
        email,
        name,
        ipAddress: CLIENT_IP,
        userAgent: USER_AGENT,
        locale: LOCALE,
      });

    /** The outcome and the ids of the run: nothing of what the client sent. */
    const outcomeOnly = (success: boolean) => ({
      // No user id: a registration is not made by a signed-in user.
      entry: {
        commandName: "RegisterUserCommand",
        commandId: expect.any(String),
        userId: undefined,
        timestamp: expect.any(Date),
        duration: expect.any(Number),
        success,
      },
      handler: {
        name: "RegisterUserCommand",
        description: expect.any(String),
      },
      paths: {
        commandId: [expect.stringMatching(IN_THE_AUDIT_ENTRY)],
        commandName: THE_NAME_IN_AN_AUDIT_ENTRY,
        password: [],
        mismatch: [],
        email: [],
        name: [],
        ipAddress: [],
        userAgent: [],
        locale: [],
      },
    });

    it("accepted: the outcome stays, not the password, address, name, IP, User-Agent or locale", async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.createWithAccount.mockResolvedValue({ id: "u1", email, name });
      mockRepo.update.mockResolvedValue({ id: "u1" });

      const result = await register(password);

      expect(result.success).toBe(true);
      expect(heldAfterRegistration()).toStrictEqual(outcomeOnly(true));
    });

    it("refused, the address is taken: recorded as not successful, without the request data", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "existing-user", email });

      const result = await register(password);

      expect(result.success).toBe(false);
      expect(mockRepo.createWithAccount).not.toHaveBeenCalled();
      expect(heldAfterRegistration()).toStrictEqual(outcomeOnly(false));
    });

    it("refused, the passwords differ: recorded as not successful, without the request data", async () => {
      const result = await register(mismatch);

      expect(result).toMatchObject({
        success: false,
        message: "Validation failed",
      });
      // Refused before the repository is asked: no repository answer is needed.
      expect(mockRepo.findByEmail).not.toHaveBeenCalled();
      expect(heldAfterRegistration()).toStrictEqual(outcomeOnly(false));
    });
  });

  it("password change: the user id and the outcome stay, not a password, the IP, the User-Agent or the locale", async () => {
    const currentPassword = "Current-Secret-4410!";
    const newPassword = "Brand-New-Secret-8826!";
    const userId = "retained-user-77";
    mockRepo.findById.mockResolvedValue({
      id: userId,
      password: await bcrypt.hash(currentPassword, 4),
    });
    mockRepo.updatePassword.mockResolvedValue(undefined);
    mockRepo.update.mockResolvedValue({ id: userId });

    const result = await commandBus.execute(
      ChangePasswordCommand,
      {
        userId,
        currentPassword,
        newPassword,
        confirmPassword: newPassword,
        locale: LOCALE,
      },
      { userId, ...REQUEST_METADATA },
    );

    expect(result.success).toBe(true);
    expect(
      heldByBus(ChangePasswordCommand, {
        userId,
        currentPassword,
        newPassword,
        ipAddress: CLIENT_IP,
        userAgent: USER_AGENT,
        locale: LOCALE,
      }),
    ).toStrictEqual({
      entry: {
        commandName: "ChangePasswordCommand",
        commandId: expect.any(String),
        userId,
        timestamp: expect.any(Date),
        duration: expect.any(Number),
        success: true,
      },
      handler: {
        name: "ChangePasswordCommand",
        description: expect.any(String),
      },
      paths: {
        commandId: [expect.stringMatching(IN_THE_AUDIT_ENTRY)],
        commandName: THE_NAME_IN_AN_AUDIT_ENTRY,
        // The walk finds the user id, in the audit entry only.
        userId: [expect.stringMatching(IN_THE_AUDIT_ENTRY)],
        currentPassword: [],
        newPassword: [],
        ipAddress: [],
        userAgent: [],
        locale: [],
      },
    });
  });

  it("the bus and the handlers have no undo / redo / history API", () => {
    const graph = reachableFrom(commandBus);
    for (const member of ["undo", "redo", "getHistory", "clearHistory"]) {
      expect(member in commandBus).toBe(false);
    }
    for (const handler of [
      handlerOf(graph, RegisterUserCommand),
      handlerOf(graph, ChangePasswordCommand),
    ]) {
      for (const member of ["undo", "redo", "canUndo"]) {
        expect(member in handler).toBe(false);
      }
    }
  });
});
