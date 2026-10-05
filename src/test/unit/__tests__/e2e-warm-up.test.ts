/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  WARM_UP_REQUEST_TIMEOUT_MS,
  WARM_UP_ROUTES,
  WARM_UP_TOTAL_TIMEOUT_MS,
  warmUp,
  type WarmUpRoute,
} from "../../../../e2e/support/warm-up";

// The warm-up of the E2E global setup (e2e/support/warm-up.ts), without a
// browser and without a server: a fake `get`, a fake clock and a log array.
// The file lives here because jest.config.js ignores every path under /e2e/.

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const ROUTES: readonly WarmUpRoute[] = [
  { path: "/en/a", entry: "/[locale]/a" },
  { path: "/en/b", entry: "/[locale]/b" },
  { path: "/api/c", entry: "/api/c" },
];

// A list that ends with the entry of the not-found page.
const ROUTES_WITH_NOT_FOUND: readonly WarmUpRoute[] = [
  { path: "/en/a", entry: "/[locale]/a" },
  { path: "/en/none", entry: "/_not-found", notFound: true },
];

/**
 * A fake server on a fake clock. `answers` are consumed in request order: a
 * number is the HTTP status, an Error is a transport failure; each request
 * takes `msPerRequest` of fake time. Missing answers are 200.
 */
function fakeServer(answers: readonly (number | Error)[], msPerRequest = 100) {
  let clock = 1_000_000;
  const requested: { path: string; timeoutMs: number }[] = [];
  const logged: string[] = [];
  return {
    requested,
    logged,
    now: () => clock,
    log: (line: string) => {
      logged.push(line);
    },
    get: async (requestPath: string, timeoutMs: number) => {
      const answer = answers[requested.length] ?? 200;
      requested.push({ path: requestPath, timeoutMs });
      clock += msPerRequest;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

describe("E2E warm-up: warmUp()", () => {
  it("requests every listed route once per pass, in list order, compile pass then check pass", async () => {
    // Every page answers 200; the path that no page serves answers 404.
    const statuses = WARM_UP_ROUTES.map((route) =>
      route.notFound ? 404 : 200,
    );
    const server = fakeServer([...statuses, ...statuses]);

    await warmUp({ get: server.get, log: server.log, now: server.now });

    const listed = WARM_UP_ROUTES.map((route) => route.path);
    const answered = (pass: string) =>
      listed.map(
        (p, index) =>
          `warm-up ${pass}: GET ${p} -> ${statuses[index]} in 100 ms`,
      );
    expect(server.requested.map((r) => r.path)).toEqual([...listed, ...listed]);
    expect(server.logged.slice(0, listed.length)).toEqual(answered("compile"));
    expect(server.logged.slice(listed.length, 2 * listed.length)).toEqual(
      answered("check"),
    );
    expect(server.logged[2 * listed.length]).toBe(
      `warm-up complete: ${listed.length} routes, 2 passes, ${2 * listed.length * 100} ms`,
    );
    expect(server.logged).toHaveLength(2 * listed.length + 1);
  });

  it("counts 200, 307 and 401 as answered and logs path, status and milliseconds of each request", async () => {
    const server = fakeServer([200, 307, 401, 200, 307, 401], 250);

    await warmUp({
      get: server.get,
      log: server.log,
      now: server.now,
      routes: ROUTES,
    });

    expect(server.logged).toEqual([
      "warm-up compile: GET /en/a -> 200 in 250 ms",
      "warm-up compile: GET /en/b -> 307 in 250 ms",
      "warm-up compile: GET /api/c -> 401 in 250 ms",
      "warm-up check: GET /en/a -> 200 in 250 ms",
      "warm-up check: GET /en/b -> 307 in 250 ms",
      "warm-up check: GET /api/c -> 401 in 250 ms",
      "warm-up complete: 3 routes, 2 passes, 1500 ms",
    ]);
  });

  it("logs a request that gets no answer, fails naming the route, and repeats nothing", async () => {
    const server = fakeServer(
      [200, new Error("Timeout 60000ms exceeded")],
      400,
    );

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES,
      }),
    ).rejects.toThrow(
      "E2E warm-up: GET /en/b (entry /[locale]/b) got no answer in the compile pass, after 400 ms: Timeout 60000ms exceeded.",
    );

    expect(server.logged).toEqual([
      "warm-up compile: GET /en/a -> 200 in 400 ms",
      "warm-up compile: GET /en/b failed after 400 ms: Timeout 60000ms exceeded",
    ]);
    // Not asked a second time, and no later route is requested.
    expect(server.requested.map((r) => r.path)).toEqual(["/en/a", "/en/b"]);
  });

  it("fails at once on 404 and says that the route list is stale", async () => {
    const server = fakeServer([200, 404]);

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES,
      }),
    ).rejects.toThrow(
      /GET \/en\/b answered 404 .*entry \/\[locale\]\/b does not exist any more: WARM_UP_ROUTES in e2e\/support\/warm-up\.ts is stale/,
    );

    expect(server.logged).toEqual([
      "warm-up compile: GET /en/a -> 200 in 100 ms",
      "warm-up compile: GET /en/b -> 404 in 100 ms",
    ]);
    expect(server.requested.map((r) => r.path)).toEqual(["/en/a", "/en/b"]);
  });

  it("counts 404 as answered for the entry of the not-found page", async () => {
    const server = fakeServer([200, 404, 200, 404]);

    await warmUp({
      get: server.get,
      log: server.log,
      now: server.now,
      routes: ROUTES_WITH_NOT_FOUND,
    });

    expect(server.logged).toEqual([
      "warm-up compile: GET /en/a -> 200 in 100 ms",
      "warm-up compile: GET /en/none -> 404 in 100 ms",
      "warm-up check: GET /en/a -> 200 in 100 ms",
      "warm-up check: GET /en/none -> 404 in 100 ms",
      "warm-up complete: 2 routes, 2 passes, 400 ms",
    ]);
  });

  it.each([200, 307, 401])(
    "fails at once when the path listed for the not-found page answers %i",
    async (status) => {
      const server = fakeServer([200, status]);

      await expect(
        warmUp({
          get: server.get,
          log: server.log,
          now: server.now,
          routes: ROUTES_WITH_NOT_FOUND,
        }),
      ).rejects.toThrow(
        `E2E warm-up: GET /en/none answered ${status} (compile pass), not 404. ` +
          "It is listed as a path that no page serves, to compile /_not-found: " +
          "choose another path in WARM_UP_ROUTES in e2e/support/warm-up.ts.",
      );

      expect(server.logged).toEqual([
        "warm-up compile: GET /en/a -> 200 in 100 ms",
        `warm-up compile: GET /en/none -> ${status} in 100 ms`,
      ]);
      expect(server.requested.map((r) => r.path)).toEqual([
        "/en/a",
        "/en/none",
      ]);
    },
  );

  it("fails on a 5xx of the not-found page as on any other", async () => {
    const server = fakeServer([200, 500]);

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES_WITH_NOT_FOUND,
      }),
    ).rejects.toThrow(
      "E2E warm-up: GET /en/none answered 500 (compile pass). The entry /_not-found does not compile or crashes",
    );
  });

  it.each([500, 503])("fails at once on %i", async (status) => {
    const server = fakeServer([status]);

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES,
      }),
    ).rejects.toThrow(
      `E2E warm-up: GET /en/a answered ${status} (compile pass). The entry /[locale]/a does not compile or crashes`,
    );

    expect(server.logged).toEqual([
      `warm-up compile: GET /en/a -> ${status} in 100 ms`,
    ]);
    expect(server.requested).toHaveLength(1);
  });

  it("fails on a 5xx in the check pass too", async () => {
    const server = fakeServer([200, 200, 200, 200, 500]);

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES,
      }),
    ).rejects.toThrow("GET /en/b answered 500 (check pass)");
    expect(server.requested).toHaveLength(5);
  });

  it("gives each request 60 s at most, and less when less is left of the 300 s total", async () => {
    // 6 requests of 55 s each: 0, 55, 110, 165, 220 and 275 s after the start.
    const server = fakeServer([], 55_000);

    await warmUp({
      get: server.get,
      log: server.log,
      now: server.now,
      routes: ROUTES,
    });

    expect(WARM_UP_REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(WARM_UP_TOTAL_TIMEOUT_MS).toBe(300_000);
    expect(server.requested.map((r) => r.timeoutMs)).toEqual([
      60_000, 60_000, 60_000, 60_000, 60_000, 25_000,
    ]);
  });

  it("stops with a clear error when the 300 s total is used up, without another request", async () => {
    // 4 requests of 80 s each use up 320 s: the fifth is never sent.
    const server = fakeServer([], 80_000);

    await expect(
      warmUp({
        get: server.get,
        log: server.log,
        now: server.now,
        routes: ROUTES,
      }),
    ).rejects.toThrow(
      "E2E warm-up did not finish within 300 s: stopped before GET /en/b (check pass).",
    );

    expect(server.requested.map((r) => r.path)).toEqual([
      "/en/a",
      "/en/b",
      "/api/c",
      "/en/a",
    ]);
  });
});

describe("E2E warm-up: WARM_UP_ROUTES", () => {
  it("lists each dev-server entry and each path once", () => {
    const entries = WARM_UP_ROUTES.map((route) => route.entry);
    const paths = WARM_UP_ROUTES.map((route) => route.path);

    expect(new Set(entries).size).toBe(entries.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(entries.length).toBeGreaterThan(0);
  });

  // The not-found page is built into Next: no file under src/app is its entry.
  const served = WARM_UP_ROUTES.filter((route) => !route.notFound);
  const notFound = WARM_UP_ROUTES.filter((route) => route.notFound);

  /** /en/x is the locale "en" of the entry /[locale]/x. */
  const asEntry = (requestPath: string) =>
    requestPath.replace(/^\/en(?=\/|$)/, "/[locale]");

  /** The page or route file of an entry under src/app, if there is one. */
  const filesOf = (entry: string) =>
    ["page.tsx", "route.ts"].filter((file) =>
      fs.existsSync(
        path.join(REPO_ROOT, "src", "app", ...entry.split("/"), file),
      ),
    );

  it.each(served.map((route) => [route.entry, route.path]))(
    "entry %s (requested as %s) exists under src/app",
    (entry) => {
      expect(filesOf(entry)).toHaveLength(1);
    },
  );

  /**
   * Whether `requestPath` is a request for `entry`, segment by segment. A
   * dynamic segment of the entry ([token]) stands for any one segment of the
   * path, and a catch-all at its end ([...nextauth]) for the rest of the
   * path. [locale] is no such segment here: asEntry() has put it in for "en".
   */
  const isRequestFor = (requestPath: string, entry: string) => {
    const asked = asEntry(requestPath).split("/");
    const segments = entry.split("/");
    const catchAll = /^\[\.\.\.\w+\]$/.test(segments.at(-1) ?? "");
    const fixed = catchAll ? segments.slice(0, -1) : segments;

    return (
      (catchAll
        ? asked.length > fixed.length
        : asked.length === fixed.length) &&
      fixed.every(
        (segment, index) =>
          segment === asked[index] ||
          (segment !== "[locale]" &&
            /^\[\w+\]$/.test(segment) &&
            asked[index] !== ""),
      )
    );
  };

  it.each(served.map((route) => [route.path, route.entry]))(
    "path %s is a request for entry %s",
    (requestPath, entry) => {
      expect(isRequestFor(requestPath, entry)).toBe(true);
    },
  );

  it("tells a request for an entry from a request for another one", () => {
    const requestsFor = (entry: string, paths: string[]) =>
      paths.filter((requestPath) => isRequestFor(requestPath, entry));

    expect(
      requestsFor("/[locale]/register", [
        "/en/register",
        "/en/account",
        "/en/register/more",
        "/en",
        "/fr/register",
      ]),
    ).toEqual(["/en/register"]);
    expect(
      requestsFor("/[locale]/verify-email/[token]", [
        "/en/verify-email/no-such-token",
        "/en/verify-email",
        "/en/verify-email/",
        "/en/verify-email/a/b",
        "/en/auth/no-such-token",
      ]),
    ).toEqual(["/en/verify-email/no-such-token"]);
    expect(
      requestsFor("/api/auth/[...nextauth]", [
        "/api/auth/providers",
        "/api/auth/callback/credentials",
        "/api/auth",
        "/api/account/info",
      ]),
    ).toEqual(["/api/auth/providers", "/api/auth/callback/credentials"]);
  });

  it("lists the not-found page once, as /_not-found, behind a path that no page or route serves", () => {
    expect(notFound.map((route) => route.entry)).toEqual(["/_not-found"]);
    expect(notFound.flatMap((route) => filesOf(asEntry(route.path)))).toEqual(
      [],
    );
    // The same lookup finds the file of a path that is served.
    expect(filesOf(asEntry("/en/register"))).toEqual(["page.tsx"]);
  });
});
