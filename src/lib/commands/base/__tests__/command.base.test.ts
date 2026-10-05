/**
 * @jest-environment node
 *
 * BaseCommand: one instance of a command serves every execution, and two
 * requests can run it at the same time. Each run logs its own command id and
 * its own duration, whichever run started last, and nothing of a run stays on
 * the instance.
 * A real command (RegisterUserCommand) is run twice on one instance, as the
 * command bus does. The repository is mocked and holds each run at its first
 * database call until the test lets it go, so the two runs overlap in a known
 * order. Only the clock is faked, so the durations are exact.
 */
const mockRepo = {
  findByEmail: jest.fn(),
  createWithAccount: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import { RegisterUserCommand } from "../../auth/register-user.command";

// NODE_ENV is read-only on modern Node; jest.replaceProperty stubs it per test.
const env = process.env as Record<string, string>;
const T0 = Date.UTC(2026, 0, 1);

const registration = (email: string) => ({
  name: "Alice Example",
  email,
  password: "ValidPass123!",
  confirmPassword: "ValidPass123!",
});

/** A database call that answers when the test says so. */
function held() {
  const control = {
    release: (_user: null) => {},
    fail: (_reason: Error) => {},
  };
  const answer = new Promise<null>((resolve, reject) => {
    control.release = resolve;
    control.fail = reject;
  });
  return { answer, ...control };
}

/** The fields of every line a console method printed with this text. */
const logged = (spy: jest.SpyInstance, text: string) =>
  spy.mock.calls.filter(([line]) => line === text).map(([, fields]) => fields);

describe("BaseCommand, two executions of one instance that overlap", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let command: RegisterUserCommand;

  beforeEach(() => {
    // next/jest loads the developer's .env: pin the cost so the test is fast.
    process.env.BCRYPT_ROUNDS = "4";
    jest.resetAllMocks();
    // The clock alone: bcryptjs waits on real timers.
    jest.useFakeTimers({
      now: T0,
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    // The "Executing" and "Success" lines are printed in development only.
    jest.replaceProperty(env, "NODE_ENV", "development");
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});

    mockRepo.createWithAccount.mockImplementation(
      async ({ email }: { email: string }) => ({
        id: `id-of-${email}`,
        email,
        name: "Alice Example",
      }),
    );
    mockRepo.update.mockResolvedValue({});
    command = new RegisterUserCommand();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  /**
   * Starts run A at T0 and run B 400 ms later, both held at their first
   * database call. A is let go 1000 ms after its start, while B still waits;
   * B is let go 1100 ms after its own start.
   */
  async function overlap(
    start: (email: string, run: string) => Promise<unknown>,
    letGo: (call: ReturnType<typeof held>) => void,
  ) {
    const first = held();
    const second = held();
    mockRepo.findByEmail
      .mockReturnValueOnce(first.answer)
      .mockReturnValueOnce(second.answer);

    const runA = start("a@example.com", "run-a");
    jest.setSystemTime(T0 + 400);
    const runB = start("b@example.com", "run-b");
    expect(mockRepo.findByEmail).toHaveBeenCalledTimes(2);

    jest.setSystemTime(T0 + 1000);
    letGo(first);
    const answerA = await runA;
    jest.setSystemTime(T0 + 1500);
    letGo(second);
    return [answerA, await runB];
  }

  const withMetadata = (email: string, commandId: string) =>
    command.execute(registration(email), {
      commandId,
      timestamp: new Date(),
    });

  it("each run that succeeds logs its own id and its own duration", async () => {
    const answers = await overlap(withMetadata, (call) => call.release(null));

    expect(answers).toMatchObject([{ success: true }, { success: true }]);
    expect(logged(logSpy, "[Command] Success RegisterUserCommand")).toEqual([
      { commandId: "run-a", duration: 1000 },
      { commandId: "run-b", duration: 1100 },
    ]);
  });

  it("each run that fails logs its own id", async () => {
    const answers = await overlap(withMetadata, (call) =>
      call.fail(new Error("connection refused")),
    );

    expect(answers).toMatchObject([{ success: false }, { success: false }]);
    expect(
      logged(errorSpy, "[Command] Error RegisterUserCommand").map(
        ({ commandId }) => commandId,
      ),
    ).toEqual(["run-a", "run-b"]);
  });

  it("a run without metadata gets an id of its own, the same in all of its lines", async () => {
    await overlap(
      (email) => command.execute(registration(email)),
      (call) => call.release(null),
    );

    const started = logged(logSpy, "[Command] Executing RegisterUserCommand");
    const succeeded = logged(logSpy, "[Command] Success RegisterUserCommand");
    expect(started).toHaveLength(2);
    expect(started[0].commandId).toEqual(expect.any(String));
    expect(started[0].commandId).not.toBe(started[1].commandId);
    expect(succeeded.map(({ commandId }) => commandId)).toEqual(
      started.map(({ commandId }) => commandId),
    );
  });

  it("nothing of a run stays on the instance", async () => {
    await overlap(withMetadata, (call) => call.release(null));

    expect({ ...command }).toStrictEqual({
      name: "RegisterUserCommand",
      description: "Register a new user account",
    });
  });
});
