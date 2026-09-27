/**
 * @jest-environment node
 */

/**
 * /api/health drives load balancers: it must be 200 when the app can serve
 * (database reachable, required configuration present) and 503 otherwise.
 * V8's heapUsed/heapTotal ratio is routinely above 90 % on a healthy, freshly
 * started process (measured: 93 %), so it must not decide the status.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));
jest.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: jest.fn() } }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const request = () => new NextRequest("http://localhost:3000/api/health");
const env = process.env as Record<string, string | undefined>;
const saved = {
  AUTH_SECRET: env.AUTH_SECRET,
  DATABASE_URL: env.DATABASE_URL,
  ENCRYPTION_KEY: env.ENCRYPTION_KEY,
};

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  env.DATABASE_URL = "postgresql://u:p@db:5432/app";
  env.AUTH_SECRET = "x".repeat(40);
  env.ENCRYPTION_KEY = "a".repeat(64);
  jest.spyOn(console, "error").mockImplementation(() => {});
  // A healthy process with a "full" V8 heap: 95 MB used of 100 MB allocated.
  jest.spyOn(process, "memoryUsage").mockReturnValue({
    rss: 200 * 1024 * 1024,
    heapTotal: 100 * 1024 * 1024,
    heapUsed: 95 * 1024 * 1024,
    external: 1024 * 1024,
    arrayBuffers: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});

it("is 200 when the database and configuration are fine, whatever the heap ratio", async () => {
  const res = await GET(request());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("healthy");
  expect(body.checks.memory.heapUsagePercent).toBe(95);
});

it("is 503 when the database is unreachable", async () => {
  queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED"));
  const res = await GET(request());
  expect(res.status).toBe(503);
});

it("is 503 when required configuration is missing, without naming it", async () => {
  delete env.ENCRYPTION_KEY;
  const res = await GET(request());
  expect(res.status).toBe(503);
  expect(JSON.stringify(await res.json())).not.toContain("ENCRYPTION_KEY");
});
