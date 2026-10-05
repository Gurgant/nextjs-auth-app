/**
 * @jest-environment node
 */

/**
 * /api/auth/[...nextauth] exports the handlers of Auth.js wrapped with the
 * refusal page (src/lib/auth/link-refusal.ts), for both methods: Auth.js
 * runs the OAuth callback on GET and on POST (read in @auth/core 0.41.3,
 * lib/index.js). Exported as they come from NextAuth, a refused link would
 * still be refused, and the visitor would read "Configuration Error".
 *
 * The handlers are stand-ins that do what Auth.js does when the link gate
 * refuses: the refusal is noted during the request, and the answer is the
 * redirect to the configured error page.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));
jest.mock("@/lib/auth", () => {
  const { noteLinkRefusal } = jest.requireActual<
    typeof import("@/lib/auth/link-refusal")
  >("@/lib/auth/link-refusal");
  const refused = async () => {
    noteLinkRefusal();
    return Response.redirect(
      "http://localhost:3000/en/auth/error?error=Configuration",
    );
  };
  return { handlers: { GET: jest.fn(refused), POST: jest.fn(refused) } };
});

import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import * as route from "../route";

const CALLBACK_URL = "http://localhost:3000/api/auth/callback/google?code=abc";

it("exports GET and POST only", () => {
  expect(Object.keys(route).sort()).toEqual(["GET", "POST"]);
});

it.each([
  ["GET", route.GET, handlers.GET],
  ["POST", route.POST, handlers.POST],
] as const)(
  "%s hands the request to the handler of Auth.js and sends a refused link to the refusal page",
  async (method, exported, handler) => {
    const request = new NextRequest(CALLBACK_URL, { method });

    const response = await exported(request);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/error?error=LinkNotConfirmed",
    );
  },
);
