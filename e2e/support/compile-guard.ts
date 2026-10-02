import type { FullResult, Reporter, TestCase } from "@playwright/test/reporter";
import { WARM_UP_ROUTES } from "./warm-up";

/**
 * Playwright reporter that fails the run when the dev server compiles while
 * tests are running.
 *
 * The global setup compiles every route the suite visits before the first
 * test (e2e/support/warm-up.ts). A "Compiled" line of `next dev` after that
 * is one of four things:
 *
 * - A route that is not in WARM_UP_ROUTES: a spec visits a route the warm-up
 *   does not request, and paid the compile inside one of its own waits.
 * - A route of WARM_UP_ROUTES that no "Compiled" line named before the first
 *   test: its request in the list did not make `next dev` compile it. (The
 *   warm-up accepts every answer except 404 and 5xx, so it does not notice.)
 *   Not seen in a run; the guard is unit-tested for it.
 * - A route of WARM_UP_ROUTES, compiled again. `next dev` flags an entry that
 *   was not requested for 60 s and removes the flagged entries when a
 *   compilation starts; the next request of such a route compiles it again.
 *   So one compile inside a test can be followed by more. Measured: after a
 *   spec that sent no request for 70 s and then opened a page outside the
 *   list, four listed routes were compiled again. In next 15.5.26:
 *   dist/server/dev/on-demand-entry-handler.js:247-248
 *     if (lastActiveTime && Date.now() - lastActiveTime > maxInactiveAge) {
 *         entries[entryKey].dispose = true;
 *   (run every 6 s, line 414; `maxInactiveAge: 60 * 1000` in
 *   dist/server/config-shared.js:66; the pages a browser pinged last are
 *   exempt, line 246), and dist/server/dev/hot-reloader-webpack.js:692-694,
 *   inside the `config.entry` function that webpack calls for each
 *   compilation
 *     const pageExists = !dispose && existsSync(entryData.absolutePagePath);
 *     if (!pageExists) {
 *         delete entries[entryKey];
 * - A line that names no route. `next dev` prints it after a file of the
 *   working tree changed. It has also printed one directly after a route
 *   compile with no file changed (measured in the warm-up and inside a
 *   test), so next to a first compile of a route it does not show that a
 *   file changed. A rebuild after a file change is a compilation as well, so
 *   it removes the flagged entries like any other.
 *
 * In each case the results of the run are not trustworthy, so the run fails
 * even when every test passed.
 *
 * The guard reads the output of the dev server that Playwright started
 * (`webServer.stdout: "pipe"`). The output of a reused server
 * (E2E_REUSE_SERVER=1) is not visible; the guard then says it is inactive.
 * Without that variable Playwright starts the server itself, so missing
 * output means that the guard does not work: in CI the run fails, elsewhere
 * the guard prints a notice. (Elsewhere, because in UI mode the server's
 * output goes to another reporter: playwright 1.55.1,
 * lib/runner/testRunner.js:101-103 and 268-269; read there, not measured.)
 *
 * Only a type import and warm-up.ts (which has no import) on purpose: the
 * Jest unit tests load this file as it is.
 */

/** What compiledIn() returns for a "Compiled" line that names no route. */
export const NO_ROUTE = "(no route)";

// Playwright prefixes every line of the dev server's output with this.
const SERVER_PREFIX = "[WebServer] ";
// Colour codes around the prefix and inside the lines of `next dev`.
const ANSI_CODES = new RegExp(
  String.fromCharCode(27) + "\\[[0-9;]*[A-Za-z]",
  "g",
);
// " ✓ Compiled /[locale]/register in 7.6s (1847 modules)": a route.
// " ✓ Compiled in 1497ms (1984 modules)": no route.
// "Compiling <route> ..." is printed only for compiles longer than 500 ms and
// is ignored, so each compile counts once.
const COMPILED = /^\s*(?:\S\s+)?Compiled(?: (\S+))? in \d/;

/**
 * The route a line of `next dev` reports as compiled, NO_ROUTE for a
 * "Compiled" line without a route, or null for any other line. The line must
 * come without colour codes and without the "[WebServer] " prefix.
 */
export function compiledIn(serverLine: string): string | null {
  const match = COMPILED.exec(serverLine);
  if (!match) return null;
  return match[1] ?? NO_ROUTE;
}

type Stream = "stdout" | "stderr";

interface Failure {
  /** What the guard prints to the log. */
  lines: string[];
  /** The same on one line, for the GitHub annotation. */
  annotation: string;
}

const failureOf = (message: string): Failure => ({
  lines: [message],
  annotation: message,
});

export default class CompileGuard implements Reporter {
  private sawServerOutput = false;
  private testsStarted = false;
  private readonly compiledBeforeTests: string[] = [];
  private readonly compiledDuringTests: string[] = [];
  // Unterminated end of the previous chunk, per stream.
  private readonly rest: Record<Stream, string> = { stdout: "", stderr: "" };

  printsToStdio(): boolean {
    return false;
  }

  // The begin of the first test is the boundary, not onBegin: Playwright
  // holds back the output printed before the run begins (server start, global
  // setup with the warm-up) and hands it over right after onBegin.
  onTestBegin(): void {
    this.testsStarted = true;
  }

  onStdOut(chunk: string | Buffer, test?: void | TestCase): void {
    if (!test) this.read("stdout", chunk);
  }

  onStdErr(chunk: string | Buffer, test?: void | TestCase): void {
    if (!test) this.read("stderr", chunk);
  }

  async onEnd(
    result: FullResult,
  ): Promise<{ status: FullResult["status"] } | undefined> {
    if (!this.testsStarted) return undefined;

    const failure = this.failure();
    if (failure === null) {
      if (!this.sawServerOutput) {
        process.stderr.write(`\n${this.inactiveNotice()}\n`);
      }
      return undefined;
    }

    process.stderr.write(`\n${failure.lines.join("\n")}\n`);
    if (process.env.GITHUB_ACTIONS) {
      // One annotation on the workflow run; the explanations are in the log.
      process.stdout.write(
        `::error title=E2E compile guard::${failure.annotation}\n`,
      );
    }
    // A run that failed, timed out or was interrupted keeps its own status.
    return result.status === "passed" ? { status: "failed" } : undefined;
  }

  /** What to print when the guard fails the run, or null. */
  private failure(): Failure | null {
    if (this.compiledDuringTests.length > 0) return this.compiledFailure();

    // Measured without `stdout: "pipe"`: the server's error stream still
    // reaches the guard (Playwright pipes it by default), so it is this case.
    if (this.sawServerOutput && this.compiledBeforeTests.length === 0) {
      return failureOf(
        "Compile guard: FAILED. The output of the dev server was visible, " +
          'but it had no "Compiled <route> in ..." line before the tests, ' +
          "although the warm-up compiles every route then. Either webServer " +
          'in playwright.config.ts lost `stdout: "pipe"` (the error stream ' +
          "alone still reaches the guard), or `next dev` words its compile " +
          "lines differently now: then update e2e/support/compile-guard.ts.",
      );
    }

    // Playwright reuses a server only with E2E_REUSE_SERVER=1 (see
    // playwright.config.ts). Without it the output must be there; in CI its
    // absence fails the run instead of leaving a green run with a dead guard.
    if (
      !this.sawServerOutput &&
      process.env.E2E_REUSE_SERVER !== "1" &&
      process.env.CI
    ) {
      return failureOf(
        "Compile guard: FAILED. The output of the dev server was expected " +
          "but not visible, so a compile while the tests were running could " +
          "not be detected. Playwright starts the server itself unless " +
          "E2E_REUSE_SERVER is 1. Check that webServer in " +
          'playwright.config.ts keeps `stdout: "pipe"`, and that Playwright ' +
          'still puts "[WebServer] " in front of the server\'s lines (it is ' +
          "built from `webServer.name`).",
      );
    }

    return null;
  }

  /** The dev server compiled while tests were running. */
  private compiledFailure(): Failure {
    const listed = new Set(WARM_UP_ROUTES.map((route) => route.entry));
    const warmedUp = new Set(this.compiledBeforeTests);
    const routes = this.compiledDuringTests.filter((c) => c !== NO_ROUTE);
    const notListed = routes.filter((route) => !listed.has(route));
    const notWarmedUp = routes.filter(
      (route) => listed.has(route) && !warmedUp.has(route),
    );
    const listedAgain = routes.filter(
      (route) => listed.has(route) && warmedUp.has(route),
    );
    const noRoute = this.compiledDuringTests.length - routes.length;
    // A route compiled for the first time inside a test starts a compile of
    // its own; a listed route compiled again follows from another compile.
    const firstCompiles = notListed.length + notWarmedUp.length;

    const items: string[] = [];
    for (const [route, times] of count(notListed)) {
      items.push(`route not in WARM_UP_ROUTES: ${route} (${times}x)`);
    }
    for (const [route, times] of count(notWarmedUp)) {
      items.push(
        `listed route not compiled by the warm-up: ${route} (${times}x)`,
      );
    }
    for (const [route, times] of count(listedAgain)) {
      items.push(`listed route compiled again: ${route} (${times}x)`);
    }
    if (noRoute > 0) {
      items.push(`"Compiled" line that names no route (${noRoute}x)`);
    }

    const headline =
      "Compile guard: FAILED. The dev server compiled while tests were " +
      "running, so this run fails even if every test passed.";
    const lines = [headline, ...items.map((item) => `  - ${item}`)];
    if (notListed.length > 0) {
      lines.push(
        "Not in WARM_UP_ROUTES (e2e/support/warm-up.ts): a spec visits a " +
          "route that the warm-up does not request. Add the request that " +
          "compiles it.",
      );
    }
    if (notWarmedUp.length > 0) {
      lines.push(
        'Listed, but not compiled by the warm-up: no "Compiled" line named ' +
          "the route before the first test, so its request in " +
          "WARM_UP_ROUTES (e2e/support/warm-up.ts) did not make `next dev` " +
          "compile it, for example because it is answered before the " +
          "route's code runs. Change that request.",
      );
    }
    if (listedAgain.length > 0) {
      lines.push(
        "Listed routes compiled again: this follows from another compile. " +
          "`next dev` drops an entry that was not requested for 60 s when a " +
          "compile starts, and compiles it again on its next request. Deal " +
          "with the other compiles listed here first; if there is none, the " +
          "guard did not see the compile that started it.",
      );
    }
    if (noRoute > 0 && firstCompiles > 0) {
      lines.push(
        'A "Compiled" line that names no route can belong to a route ' +
          "compile listed here: `next dev` has printed one directly after a " +
          "route compile with no file changed. It does not show that a file " +
          "changed.",
      );
    }
    if (noRoute > 0 && firstCompiles === 0) {
      lines.push(
        'A "Compiled" line that names no route, in a run where no route ' +
          "was compiled for the first time, is what `next dev` prints after " +
          "a file of the working tree changed (an editor save, a formatter, " +
          "a git checkout). " +
          (listedAgain.length > 0
            ? "That rebuild is a compile too, so it can be the one that " +
              "the listed routes compiled again follow from. "
            : "") +
          "The results of such a run are not trustworthy: leave the files " +
          "alone and run the suite again.",
      );
    }

    return {
      lines,
      annotation: `${headline} Compiled: ${items.join("; ")}`,
    };
  }

  /** No output of the dev server was visible, and the run is not failed. */
  private inactiveNotice(): string {
    if (process.env.E2E_REUSE_SERVER === "1") {
      return (
        "Compile guard: INACTIVE in this run. The output of the dev server " +
        "was not visible (E2E_REUSE_SERVER=1: Playwright does not see the " +
        "output of a server it did not start), so a compile while the " +
        "tests were running could not be detected."
      );
    }
    return (
      "Compile guard: INACTIVE in this run. The output of the dev server " +
      "was not visible, although E2E_REUSE_SERVER is not 1, so a compile " +
      "while the tests were running could not be detected. Possible " +
      "causes: the run was started in UI mode (`pnpm test:e2e:ui`); " +
      "webServer in playwright.config.ts no longer pipes the server's " +
      'output (`stdout: "pipe"`); Playwright no longer puts "[WebServer] " ' +
      "in front of the server's lines (it is built from " +
      "`webServer.name`). With CI set, this fails the run."
    );
  }

  private read(stream: Stream, chunk: string | Buffer): void {
    const pieces = chunk.toString().replace(ANSI_CODES, "").split("\n");
    // Playwright prefixes each chunk on its own, so a line cut in two by a
    // chunk boundary carries the prefix on both halves.
    const texts = pieces.map((piece) => {
      if (!piece.startsWith(SERVER_PREFIX)) return piece;
      this.sawServerOutput = true;
      return piece.slice(SERVER_PREFIX.length);
    });
    texts[0] = this.rest[stream] + texts[0];
    this.rest[stream] = texts.pop() ?? "";

    for (const line of texts) {
      const compiled = compiledIn(line);
      if (compiled === null) continue;
      if (this.testsStarted) this.compiledDuringTests.push(compiled);
      else this.compiledBeforeTests.push(compiled);
    }
  }
}

function count(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}
