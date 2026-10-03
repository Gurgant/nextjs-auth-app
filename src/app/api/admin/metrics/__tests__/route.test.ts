/**
 * @jest-environment node
 */

/**
 * Authorization contract of /api/admin/metrics. GET, the only method the
 * route exports, is wrapped in withRole("ADMIN", …) (src/lib/auth/rbac.ts):
 *   no session / session without user -> 401
 *   authenticated but not ADMIN       -> 403
 *   ADMIN                             -> 200
 * and the wrapped handler must never run for a rejected caller.
 *
 * Runs against the REAL next/server: the global next/server mock in
 * jest.setup.js has no NextResponse.json, which withRole and the route use.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));

// auth() is the only identity source withRole consults.
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: jest.fn() },
    securityEvent: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as route from "../route";

const { GET } = route;

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const db = prisma as unknown as {
  user: { count: jest.Mock };
  securityEvent: { findMany: jest.Mock; count: jest.Mock };
};

const METRICS_URL = "http://localhost:3000/api/admin/metrics";

function sessionWithRole(role?: string) {
  return {
    user: {
      id: "user-1",
      email: "someone@example.com",
      ...(role !== undefined ? { role } : {}),
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function expectHandlerNotRun() {
  expect(db.user.count).not.toHaveBeenCalled();
  expect(db.securityEvent.findMany).not.toHaveBeenCalled();
  expect(db.securityEvent.count).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  db.user.count.mockResolvedValue(3);
  db.securityEvent.findMany.mockResolvedValue([]);
  db.securityEvent.count.mockResolvedValue(0);
});

describe("GET /api/admin/metrics authorization", () => {
  const call = () => GET(new NextRequest(METRICS_URL));

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Authentication required",
    });
    expectHandlerNotRun();
  });

  it("returns 401 when the session has no user", async () => {
    mockAuth.mockResolvedValue({ expires: new Date().toISOString() });

    const res = await call();

    expect(res.status).toBe(401);
    expectHandlerNotRun();
  });

  it.each(["USER", "PRO_USER"])("returns 403 for role %s", async (role) => {
    mockAuth.mockResolvedValue(sessionWithRole(role));

    const res = await call();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Insufficient permissions",
    });
    expectHandlerNotRun();
  });

  it("returns 403 when the session carries no role", async () => {
    mockAuth.mockResolvedValue(sessionWithRole());

    const res = await call();

    expect(res.status).toBe(403);
    expectHandlerNotRun();
  });

  it("returns 403 for an unknown role value", async () => {
    mockAuth.mockResolvedValue(sessionWithRole("SUPERUSER"));

    const res = await call();

    expect(res.status).toBe(403);
    expectHandlerNotRun();
  });

  it("returns 200 for ADMIN", async () => {
    mockAuth.mockResolvedValue(sessionWithRole("ADMIN"));

    const res = await call();

    expect(res.status).toBe(200);
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });
});

describe("ADMIN responses", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(sessionWithRole("ADMIN"));
  });

  it("GET returns uncached figures that are read at request time", async () => {
    const res = await GET(new NextRequest(METRICS_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "alerts",
      "database",
      "responseTime",
      "security",
      "system",
      "timestamp",
    ]);
    expect(body.database).toEqual({ userCount: 3, recentSecurityEvents: [] });
    expect(Object.keys(body.alerts).sort()).toEqual([
      "highErrorRate",
      "highMemoryUsage",
    ]);

    // A later request reports the figures of that moment, not earlier ones.
    db.user.count.mockResolvedValueOnce(4);
    db.securityEvent.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);

    const later = await (await GET(new NextRequest(METRICS_URL))).json();

    expect(later.database.userCount).toBe(4);
    expect(later.security.errorRate).toEqual({
      total: 10,
      errors: 1,
      rate: 10,
      period: "1 hour",
    });
  });
});

describe("/api/admin/metrics methods", () => {
  it("exports GET and no DELETE", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
