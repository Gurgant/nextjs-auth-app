/**
 * @jest-environment node
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from "@playwright/test/reporter";
import CompileGuard, {
  NO_ROUTE,
  compiledIn,
} from "../../../../e2e/support/compile-guard";
import { WARM_UP_ROUTES } from "../../../../e2e/support/warm-up";

// The compile guard of the E2E suite (e2e/support/compile-guard.ts), without
// Playwright: the reporter's methods are called the way Playwright calls them.
// The file lives here because jest.config.js ignores every path under /e2e/.

const ESC = String.fromCharCode(27);
// What Playwright puts in front of every line of the dev server's output.
const PREFIX = `${ESC}[2m[WebServer] ${ESC}[22m`;
// The coloured marks of `next dev`.
const DONE = ` ${ESC}[32m${ESC}[1m✓${ESC}[22m${ESC}[39m `;
const WAIT = ` ${ESC}[37m${ESC}[1m○${ESC}[22m${ESC}[39m `;

// Lines as a run of the suite printed them (next 15.5.26, Playwright 1.55.1).
const COMPILED_LOCALE = `${PREFIX}${DONE}Compiled /[locale] in 13.9s (867 modules)\n`;
// A route of WARM_UP_ROUTES.
const COMPILED_REGISTER = `${PREFIX}${DONE}Compiled /[locale]/register in 7.6s (1847 modules)\n`;
// A route that is not in WARM_UP_ROUTES: no spec requests it. The line is as
// `next dev` printed it for a request sent by hand.
const COMPILED_HEALTH = `${PREFIX}${DONE}Compiled /api/health in 3.3s (383 modules)\n`;
const COMPILING_REGISTER = `${PREFIX}${WAIT}Compiling /[locale]/register ...\n`;
const COMPILED_NO_ROUTE = `${PREFIX}${DONE}Compiled in 1497ms (1984 modules)\n`;
const REQUEST = `${PREFIX} GET /en ${ESC}[32m200${ESC}[39m in 248ms\n`;
// Printed on the error stream.
const STDERR_LINE = `${PREFIX}[auth][warn][debug-enabled] Read more: https://warnings.authjs.dev\n`;

const HEADLINE =
  "Compile guard: FAILED. The dev server compiled while tests were " +
  "running, so this run fails even if every test passed.";

const result = (status: FullResult["status"]): FullResult => ({
  status,
  startTime: new Date(0),
  duration: 0,
});

/**
 * Playwright hands a reporter the server's output late. Everything printed
 * before the run is reported as begun (server start, availability check,
 * global setup with the warm-up) is held back and passed on right AFTER
 * onBegin (playwright 1.55.1, lib/reporters/reporterV2.js). Measured: a guard
 * that took onBegin as the start of the tests failed a run with 82 passed
 * tests and no compile inside them, listing all 12 compiles of the server
 * start and the warm-up.
 */
function beginLikePlaywright(guard: Reporter, heldBack: readonly string[]) {
  guard.onBegin?.({} as FullConfig, {} as Suite);
  for (const chunk of heldBack) guard.onStdOut?.(chunk);
}

/**
 * A guard after the global setup: the warm-up compiled every route of
 * WARM_UP_ROUTES, as in a real run, then a test began.
 */
function guardWithTestsRunning(): CompileGuard {
  const guard = new CompileGuard();
  beginLikePlaywright(
    guard,
    WARM_UP_ROUTES.map(
      (route) =>
        `${PREFIX}${DONE}Compiled ${route.entry} in 1.2s (1900 modules)\n`,
    ),
  );
  guard.onTestBegin();
  return guard;
}

/** A guard whose warm-up compiled `/[locale]` only, and one test. */
function guardWithOnlyTheHomeWarmedUp(): CompileGuard {
  const guard = new CompileGuard();
  beginLikePlaywright(guard, [COMPILED_LOCALE]);
  guard.onTestBegin();
  return guard;
}

/** A guard that saw no line of the dev server at all, and one test. */
function guardWithoutServerOutput(): CompileGuard {
  const guard = new CompileGuard();
  beginLikePlaywright(guard, []);
  guard.onTestBegin();
  return guard;
}

describe("E2E compile guard: compiledIn()", () => {
  it("returns the route of a first-request compile", () => {
    expect(
      compiledIn(" ✓ Compiled /[locale]/register in 7.6s (1847 modules)"),
    ).toBe("/[locale]/register");
    expect(
      compiledIn(" ✓ Compiled /[locale]/register in 1713ms (1547 modules)"),
    ).toBe("/[locale]/register");
  });

  it("returns NO_ROUTE for a line that names no route", () => {
    expect(compiledIn(" ✓ Compiled in 1497ms (1984 modules)")).toBe(NO_ROUTE);
    expect(NO_ROUTE).toBe("(no route)");
  });

  it("returns null for a line that reports no finished compile", () => {
    expect(compiledIn(" ○ Compiling /[locale] ...")).toBeNull();
    expect(compiledIn(" GET /en 200 in 248ms")).toBeNull();
    expect(compiledIn(" ✓ Ready in 5.9s")).toBeNull();
    expect(compiledIn(" GET /en/search?q=Compiled 200 in 12ms")).toBeNull();
    expect(compiledIn("")).toBeNull();
  });
});

describe("E2E compile guard: the reporter", () => {
  const ENV_NAMES = ["CI", "E2E_REUSE_SERVER", "GITHUB_ACTIONS"] as const;
  const savedEnv = ENV_NAMES.map((name) => process.env[name]);
  let stderr: jest.SpyInstance;
  let stdout: jest.SpyInstance;
  const printed = (spy: jest.SpyInstance) =>
    spy.mock.calls.map((call) => String(call[0])).join("");

  beforeEach(() => {
    for (const name of ENV_NAMES) delete process.env[name];
    stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    stdout.mockRestore();
    ENV_NAMES.forEach((name, index) => {
      const saved = savedEnv[index];
      if (saved === undefined) delete process.env[name];
      else process.env[name] = saved;
    });
  });

  it("has fixtures on both sides of WARM_UP_ROUTES", () => {
    const listed = WARM_UP_ROUTES.map((route) => route.entry);

    expect(listed).toContain("/[locale]/register");
    expect(listed).not.toContain("/api/health");
  });

  it("does not print to the terminal on its own behalf (the list reporter stays)", () => {
    expect(new CompileGuard().printsToStdio()).toBe(false);
  });

  it("lets a run pass when every compile came before the tests (the warm-up)", async () => {
    const guard = new CompileGuard();
    beginLikePlaywright(guard, [
      COMPILED_LOCALE,
      COMPILING_REGISTER,
      COMPILED_REGISTER,
    ]);
    guard.onTestBegin();
    guard.onStdOut(REQUEST);

    expect(await guard.onEnd(result("passed"))).toBeUndefined();
    expect(printed(stderr)).toBe("");
  });

  it("counts a compile between the begin of the run and the first test as before the tests", async () => {
    const guard = new CompileGuard();
    beginLikePlaywright(guard, [COMPILED_LOCALE]);
    guard.onStdOut(COMPILED_REGISTER);
    guard.onTestBegin();

    expect(await guard.onEnd(result("passed"))).toBeUndefined();
    expect(printed(stderr)).toBe("");
  });

  it("fails the run and says 'not in WARM_UP_ROUTES' for a route outside the list compiled after the tests began", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(COMPILED_HEALTH);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      `\n${HEADLINE}\n` +
        "  - route not in WARM_UP_ROUTES: /api/health (1x)\n" +
        "Not in WARM_UP_ROUTES (e2e/support/warm-up.ts): a spec visits a " +
        "route that the warm-up does not request. Add the request that " +
        "compiles it.\n",
    );
  });

  it("fails the run and says 'compiled again', with the 60 s of `next dev`, for a listed route compiled after the tests began", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(COMPILING_REGISTER);
    guard.onStdOut(COMPILED_REGISTER);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      `\n${HEADLINE}\n` +
        "  - listed route compiled again: /[locale]/register (1x)\n" +
        "Listed routes compiled again: this follows from another compile. " +
        "`next dev` drops an entry that was not requested for 60 s when a " +
        "compile starts, and compiles it again on its next request. Deal " +
        "with the other compiles listed here first; if there is none, the " +
        "guard did not see the compile that started it.\n",
    );
  });

  it("does not say 'compiled again' for a listed route that no compile line named before the tests: the warm-up did not compile it", async () => {
    const guard = guardWithOnlyTheHomeWarmedUp();
    guard.onStdOut(COMPILED_REGISTER + COMPILED_LOCALE);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      `\n${HEADLINE}\n` +
        "  - listed route not compiled by the warm-up: /[locale]/register (1x)\n" +
        "  - listed route compiled again: /[locale] (1x)\n" +
        'Listed, but not compiled by the warm-up: no "Compiled" line named ' +
        "the route before the first test, so its request in WARM_UP_ROUTES " +
        "(e2e/support/warm-up.ts) did not make `next dev` compile it, for " +
        "example because it is answered before the route's code runs. " +
        "Change that request.\n" +
        "Listed routes compiled again: this follows from another compile. " +
        "`next dev` drops an entry that was not requested for 60 s when a " +
        "compile starts, and compiles it again on its next request. Deal " +
        "with the other compiles listed here first; if there is none, the " +
        "guard did not see the compile that started it.\n",
    );
  });

  it("separates the routes that are not in the list from the listed routes compiled again, and counts each compile", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(
      COMPILED_REGISTER + REQUEST + COMPILED_HEALTH + COMPILED_REGISTER,
    );

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    const lines = printed(stderr).split("\n");
    expect(lines.slice(1, 5)).toEqual([
      HEADLINE,
      "  - route not in WARM_UP_ROUTES: /api/health (1x)",
      "  - listed route compiled again: /[locale]/register (2x)",
      expect.stringMatching(/^Not in WARM_UP_ROUTES /),
    ]);
    expect(lines[5]).toMatch(/^Listed routes compiled again: /);
    expect(printed(stderr)).not.toContain("names no route");
  });

  it("fails the run for a line that names no route, and points to a file change when no route was compiled", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(COMPILED_NO_ROUTE);
    guard.onStdOut(COMPILED_NO_ROUTE);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      `\n${HEADLINE}\n` +
        '  - "Compiled" line that names no route (2x)\n' +
        'A "Compiled" line that names no route, in a run where no route was ' +
        "compiled for the first time, is what `next dev` prints after a " +
        "file of the working tree changed (an editor save, a formatter, a " +
        "git checkout). The results of such a run are not trustworthy: " +
        "leave the files alone and run the suite again.\n",
    );
  });

  it("says that a line that names no route can belong to a route compile of the same run, not that a file changed", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(COMPILED_HEALTH + COMPILED_NO_ROUTE);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    const message = printed(stderr);
    expect(message).toContain(
      "  - route not in WARM_UP_ROUTES: /api/health (1x)\n" +
        '  - "Compiled" line that names no route (1x)\n',
    );
    expect(message).toContain(
      'A "Compiled" line that names no route can belong to a route compile ' +
        "listed here: `next dev` has printed one directly after a route " +
        "compile with no file changed. It does not show that a file " +
        "changed.\n",
    );
    expect(message).not.toContain("leave the files alone");
    expect(message).not.toContain("is what `next dev` prints after a file");
  });

  it("points to a file change when a line that names no route comes with listed routes compiled again only", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(COMPILED_NO_ROUTE + COMPILED_REGISTER);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      `\n${HEADLINE}\n` +
        "  - listed route compiled again: /[locale]/register (1x)\n" +
        '  - "Compiled" line that names no route (1x)\n' +
        "Listed routes compiled again: this follows from another compile. " +
        "`next dev` drops an entry that was not requested for 60 s when a " +
        "compile starts, and compiles it again on its next request. Deal " +
        "with the other compiles listed here first; if there is none, the " +
        "guard did not see the compile that started it.\n" +
        'A "Compiled" line that names no route, in a run where no route was ' +
        "compiled for the first time, is what `next dev` prints after a " +
        "file of the working tree changed (an editor save, a formatter, a " +
        "git checkout). That rebuild is a compile too, so it can be the one " +
        "that the listed routes compiled again follow from. The results of " +
        "such a run are not trustworthy: leave the files alone and run the " +
        "suite again.\n",
    );
  });

  it("detects once a compile line that Playwright delivered in two chunks, each with the prefix", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdOut(`${PREFIX}${DONE}Compiled /[locale]/regi`);
    guard.onStdOut(`${PREFIX}ster in 7.6s (1847 modules)\n`);

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toContain(
      "  - listed route compiled again: /[locale]/register (1x)\n",
    );
  });

  it("reads Buffer chunks and the error stream as well", async () => {
    const guard = guardWithTestsRunning();
    guard.onStdErr(Buffer.from(COMPILED_REGISTER));

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toContain(
      "  - listed route compiled again: /[locale]/register (1x)\n",
    );
  });

  it("fails when the server's output was visible but had no compile line before the tests (the guard is blind)", async () => {
    const guard = new CompileGuard();
    beginLikePlaywright(guard, [REQUEST]);
    guard.onTestBegin();

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    const message = printed(stderr);
    expect(message).toContain("Compile guard: FAILED.");
    expect(message).toContain("update e2e/support/compile-guard.ts");
  });

  it('names the missing `stdout: "pipe"` when only the server\'s error stream was visible', async () => {
    // Measured without `stdout: "pipe"`: the error stream still arrives, with
    // lines like this one, and the compile lines (standard output) do not.
    const guard = new CompileGuard();
    beginLikePlaywright(guard, []);
    guard.onStdErr(STDERR_LINE);
    guard.onStdErr(STDERR_LINE);
    guard.onTestBegin();

    expect(await guard.onEnd(result("passed"))).toEqual({ status: "failed" });
    expect(printed(stderr)).toBe(
      "\nCompile guard: FAILED. The output of the dev server was visible, " +
        'but it had no "Compiled <route> in ..." line before the tests, ' +
        "although the warm-up compiles every route then. Either webServer " +
        'in playwright.config.ts lost `stdout: "pipe"` (the error stream ' +
        "alone still reaches the guard), or `next dev` words its compile " +
        "lines differently now: then update " +
        "e2e/support/compile-guard.ts.\n",
    );
  });

  describe("when no output of the dev server was visible", () => {
    it("says it is inactive, and fails nothing, with a reused server (E2E_REUSE_SERVER=1), in CI too", async () => {
      for (const ci of [undefined, "1"]) {
        if (ci === undefined) delete process.env.CI;
        else process.env.CI = ci;
        process.env.E2E_REUSE_SERVER = "1";
        stderr.mockClear();

        expect(
          await guardWithoutServerOutput().onEnd(result("passed")),
        ).toBeUndefined();
        expect(printed(stderr)).toBe(
          "\nCompile guard: INACTIVE in this run. The output of the dev " +
            "server was not visible (E2E_REUSE_SERVER=1: Playwright does " +
            "not see the output of a server it did not start), so a compile " +
            "while the tests were running could not be detected.\n",
        );
      }
    });

    it.each([
      ["unset", undefined],
      ["0", "0"],
      ["true", "true"],
    ])(
      "fails the run in CI when E2E_REUSE_SERVER is %s: the output was expected",
      async (_label, reuse) => {
        process.env.CI = "1";
        if (reuse !== undefined) process.env.E2E_REUSE_SERVER = reuse;

        expect(
          await guardWithoutServerOutput().onEnd(result("passed")),
        ).toEqual({ status: "failed" });
        expect(printed(stderr)).toBe(
          "\nCompile guard: FAILED. The output of the dev server was " +
            "expected but not visible, so a compile while the tests were " +
            "running could not be detected. Playwright starts the server " +
            "itself unless E2E_REUSE_SERVER is 1. Check that webServer in " +
            'playwright.config.ts keeps `stdout: "pipe"`, and that ' +
            'Playwright still puts "[WebServer] " in front of the ' +
            "server's lines (it is built from `webServer.name`).\n",
        );
      },
    );

    it("keeps the status of a CI run that already failed", async () => {
      process.env.CI = "1";

      expect(
        await guardWithoutServerOutput().onEnd(result("failed")),
      ).toBeUndefined();
      expect(printed(stderr)).toContain("expected but not visible");
    });

    it("outside CI, prints a notice that names the possible causes and does not assert a reused server", async () => {
      expect(
        await guardWithoutServerOutput().onEnd(result("passed")),
      ).toBeUndefined();
      expect(printed(stderr)).toBe(
        "\nCompile guard: INACTIVE in this run. The output of the dev " +
          "server was not visible, although E2E_REUSE_SERVER is not 1, so " +
          "a compile while the tests were running could not be detected. " +
          "Possible causes: the run was started in UI mode (`pnpm " +
          "test:e2e:ui`); webServer in playwright.config.ts no longer pipes " +
          'the server\'s output (`stdout: "pipe"`); Playwright no longer ' +
          'puts "[WebServer] " in front of the server\'s lines (it is built ' +
          "from `webServer.name`). With CI set, this fails the run.\n",
      );
      expect(printed(stderr)).not.toContain("reused server");
    });
  });

  it("ignores the output of a test, even when it looks like a compile line", async () => {
    const guard = guardWithTestsRunning();
    // Only its presence matters to the guard.
    const test = { title: "prints a compile line" } as TestCase;
    guard.onStdOut("Compiled /x in 1s\n", test);
    guard.onStdErr("Compiled /x in 1s\n", test);

    expect(await guard.onEnd(result("passed"))).toBeUndefined();
    expect(printed(stderr)).toBe("");
  });

  it.each(["failed", "timedout", "interrupted"] as const)(
    "reports the compile but leaves the status of a run that already %s",
    async (status) => {
      const guard = guardWithTestsRunning();
      guard.onStdOut(COMPILED_REGISTER);

      expect(await guard.onEnd(result(status))).toBeUndefined();
      expect(printed(stderr)).toContain(
        "  - listed route compiled again: /[locale]/register (1x)\n",
      );
    },
  );

  it("stays silent when no test ran", async () => {
    const guard = new CompileGuard();
    beginLikePlaywright(guard, [COMPILED_LOCALE, COMPILED_REGISTER]);

    expect(await guard.onEnd(result("passed"))).toBeUndefined();
    expect(printed(stderr)).toBe("");

    process.env.CI = "1";
    const withoutOutput = new CompileGuard();
    beginLikePlaywright(withoutOutput, []);

    expect(await withoutOutput.onEnd(result("passed"))).toBeUndefined();
    expect(printed(stderr)).toBe("");
  });

  it("adds one GitHub error annotation in GitHub Actions that names every compile, and none elsewhere", async () => {
    const compiles =
      COMPILED_HEALTH +
      COMPILED_NO_ROUTE +
      COMPILED_REGISTER +
      COMPILED_NO_ROUTE;

    const local = guardWithTestsRunning();
    local.onStdOut(compiles);
    await local.onEnd(result("passed"));
    expect(printed(stdout)).toBe("");

    process.env.GITHUB_ACTIONS = "true";
    const inActions = guardWithTestsRunning();
    inActions.onStdOut(compiles);
    await inActions.onEnd(result("passed"));
    expect(printed(stdout)).toBe(
      `::error title=E2E compile guard::${HEADLINE} Compiled: ` +
        "route not in WARM_UP_ROUTES: /api/health (1x); " +
        "listed route compiled again: /[locale]/register (1x); " +
        '"Compiled" line that names no route (2x)\n',
    );
  });

  it("puts the whole message of the other failures in the annotation", async () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.CI = "true";

    await guardWithoutServerOutput().onEnd(result("passed"));

    const annotation = printed(stdout);
    expect(annotation).toMatch(
      /^::error title=E2E compile guard::Compile guard: FAILED\. The output of the dev server was expected but not visible, /,
    );
    expect(annotation.trimEnd()).not.toContain("\n");
  });
});
