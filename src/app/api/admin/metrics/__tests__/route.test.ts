/**
 * @jest-environment node
 */

/**
 * Authorization contract of /api/admin/metrics. GET and DELETE are both
 * wrapped in withRole("ADMIN", …) (src/lib/auth/rbac.ts):
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
    session: { count: jest.fn() },
    securityEvent: { findMany: jest.fn(), count: jest.fn() },
  },
}));

// The real module starts a setInterval at import time; never load it here.
jest.mock("@/lib/monitoring/performance", () => ({
  performanceMonitor: {
    getStats: jest.fn(),
    getSlowOperations: jest.fn(),
    getSlowQueries: jest.fn(),
    clearOldMetrics: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { performanceMonitor } from "@/lib/monitoring/performance";
import { GET, DELETE } from "../route";

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const db = prisma as unknown as {
  user: { count: jest.Mock };
  session: { count: jest.Mock };
  securityEvent: { findMany: jest.Mock; count: jest.Mock };
};
const monitor = performanceMonitor as unknown as {
  getStats: jest.Mock;
  getSlowOperations: jest.Mock;
  getSlowQueries: jest.Mock;
  clearOldMetrics: jest.Mock;
};

const METRICS_URL = "http://localhost:3000/api/admin/metrics";

type RouteHandler = (request: NextRequest) => Promise<Response>;

const routes: Array<[string, RouteHandler]> = [
  ["GET", GET],
  ["DELETE", DELETE],
];

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
  expect(monitor.getStats).not.toHaveBeenCalled();
  expect(monitor.clearOldMetrics).not.toHaveBeenCalled();
  expect(db.user.count).not.toHaveBeenCalled();
  expect(db.securityEvent.findMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  monitor.getStats.mockReturnValue({ totalOperations: 0 });
  monitor.getSlowOperations.mockReturnValue([]);
  monitor.getSlowQueries.mockReturnValue([]);
  db.user.count.mockResolvedValue(3);
  db.session.count.mockResolvedValue(0);
  db.securityEvent.findMany.mockResolvedValue([]);
  db.securityEvent.count.mockResolvedValue(0);
});

describe.each(routes)(
  "%s /api/admin/metrics authorization",
  (method, handler) => {
    const call = () => handler(new NextRequest(METRICS_URL, { method }));

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
  },
);

describe("ADMIN responses", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(sessionWithRole("ADMIN"));
  });

  it("GET returns uncached metrics and does not clear them", async () => {
    const res = await GET(new NextRequest(METRICS_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
    const body = await res.json();
    expect(body.database.userCount).toBe(3);
    expect(monitor.getStats).toHaveBeenCalledTimes(1);
    expect(monitor.clearOldMetrics).not.toHaveBeenCalled();
  });

  it("DELETE clears metrics once and reads no statistics", async () => {
    const res = await DELETE(
      new NextRequest(METRICS_URL, { method: "DELETE" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      message: "Metrics cleared successfully",
    });
    expect(monitor.clearOldMetrics).toHaveBeenCalledTimes(1);
    expect(monitor.getStats).not.toHaveBeenCalled();
    expect(db.user.count).not.toHaveBeenCalled();
  });
});
