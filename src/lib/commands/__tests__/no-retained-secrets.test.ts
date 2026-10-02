/**
 * @jest-environment node
 *
 * After execute() no plain-text password stays in process memory: not on the
 * command bus, not on the (shared) handler instance. The production bus
 * (`commandBus`, with its real middleware) is used; the repository and the
 * event bus are mocked. The check walks what it can reach from the bus through
 * own properties (TypeScript-private fields included) and through Map and Set
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

function pathsHolding(root: unknown, needle: string): string[] {
  return reachableFrom(root)
    .strings.filter(({ value }) => value.includes(needle))
    .map(({ path }) => path);
}

function handlerOf<T extends object>(CommandClass: new () => T): T {
  const { objects } = reachableFrom(commandBus);
  // The walk must reach the class the handlers map is keyed by and the one
  // registered handler, or the checks below would pass without having looked
  // at them.
  expect(objects.includes(CommandClass)).toBe(true);
  const handlers = objects.filter(
    (object): object is T => object instanceof CommandClass,
  );
  expect(handlers).toHaveLength(1);
  return handlers[0];
}

describe("no plain-text password is retained after execute()", () => {
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

  it("registration: the password is on neither the bus nor the handler", async () => {
    const password = "Register-Secret-9173!";
    const email = "retained.register@example.com";
    mockRepo.findByEmail.mockResolvedValue(null);
    mockRepo.createWithAccount.mockResolvedValue({
      id: "u1",
      email,
      name: "Alice Example",
    });
    mockRepo.update.mockResolvedValue({ id: "u1" });

    const result = await commandBus.execute(RegisterUserCommand, {
      name: "Alice Example",
      email,
      password,
      confirmPassword: password,
    });

    expect(result.success).toBe(true);
    // Control: the walk does see this execution (its redacted audit entry).
    expect(pathsHolding(commandBus, email)).not.toEqual([]);
    expect(pathsHolding(commandBus, password)).toEqual([]);
    expect(pathsHolding(handlerOf(RegisterUserCommand), password)).toEqual([]);
  });

  it("refused registration: the password is not retained either", async () => {
    const password = "Refused-Secret-5521!";
    const email = "retained.refused@example.com";

    const result = await commandBus.execute(RegisterUserCommand, {
      name: "Alice Example",
      email,
      password,
      confirmPassword: "Mismatch-Secret-5521!",
    });

    expect(result).toMatchObject({
      success: false,
      message: "Validation failed",
    });
    // Refused before the repository is asked: no repository answer is needed.
    expect(mockRepo.findByEmail).not.toHaveBeenCalled();
    expect(pathsHolding(commandBus, email)).not.toEqual([]);
    expect(pathsHolding(commandBus, password)).toEqual([]);
    expect(pathsHolding(commandBus, "Mismatch-Secret-5521!")).toEqual([]);
    expect(pathsHolding(handlerOf(RegisterUserCommand), password)).toEqual([]);
  });

  it("password change: neither the current nor the new password is retained", async () => {
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
      },
      { userId },
    );

    expect(result.success).toBe(true);
    expect(pathsHolding(commandBus, userId)).not.toEqual([]);
    expect(pathsHolding(commandBus, currentPassword)).toEqual([]);
    expect(pathsHolding(commandBus, newPassword)).toEqual([]);
    const handler = handlerOf(ChangePasswordCommand);
    expect(pathsHolding(handler, currentPassword)).toEqual([]);
    expect(pathsHolding(handler, newPassword)).toEqual([]);
  });

  it("the bus and the handlers have no undo / redo / history API", () => {
    for (const member of ["undo", "redo", "getHistory", "clearHistory"]) {
      expect(member in commandBus).toBe(false);
    }
    for (const handler of [
      handlerOf(RegisterUserCommand),
      handlerOf(ChangePasswordCommand),
    ]) {
      for (const member of ["undo", "redo", "canUndo"]) {
        expect(member in handler).toBe(false);
      }
    }
  });
});
