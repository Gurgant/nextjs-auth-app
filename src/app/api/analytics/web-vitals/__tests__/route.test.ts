/**
 * @jest-environment node
 */

/**
 * /api/analytics/web-vitals is public (anonymous POSTs are accepted), so its
 * in-memory store must stay bounded and accept only real web-vitals metrics.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));
jest.mock("@/lib/auth", () => ({ auth: jest.fn().mockResolvedValue(null) }));

import { NextRequest } from "next/server";
import { GET, POST } from "../route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/analytics/web-vitals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const sample = (metric = "LCP") => ({
  metric,
  value: 1200,
  rating: "good",
  url: "/en",
  timestamp: Date.now(),
  userAgent: "jest",
});

it("keeps at most 1000 entries however many are posted", async () => {
  for (let i = 0; i < 1025; i++) {
    const res = await post(sample());
    expect(res.status).toBe(200);
  }
  const body = await (await GET()).json();
  expect(body.data.total).toBe(1000);
});

it("rejects metric names that are not web vitals", async () => {
  const res = await post(sample("anything-else"));
  expect(res.status).toBe(400);
});
