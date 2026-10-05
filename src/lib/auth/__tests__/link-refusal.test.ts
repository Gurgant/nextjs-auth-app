/**
 * @jest-environment node
 */

/**
 * The page a refused account link ends on (src/lib/auth/link-refusal.ts):
 * the wrapper around the route handlers of Auth.js replaces the redirect of
 * a request in which the link gate noted a refusal, and no other answer.
 *
 * Auth.js's half is simulated here, not exercised: the handlers below answer
 * what @auth/core 0.41.3 answers after an adapter error, a redirect to the
 * configured error page with `error=Configuration` (read in its index.js).
 */

jest.mock("next/server", () => jest.requireActual("next/server"));

import { NextRequest } from "next/server";
import {
  LINK_REFUSED_PATH,
  noteLinkRefusal,
  withLinkRefusalPage,
} from "@/lib/auth/link-refusal";

const CALLBACK_URL = "http://localhost:3000/api/auth/callback/google?code=abc";
// What Auth.js answers after an adapter error.
const CONFIGURATION_ERROR =
  "http://localhost:3000/en/auth/error?error=Configuration";
const REFUSAL_PAGE = "http://localhost:3000/auth/error?error=LinkNotConfirmed";

const callback = () => new NextRequest(CALLBACK_URL);

/** Lets everything that is already queued run. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

it("sends a refused link to the error page without a locale", () => {
  expect(LINK_REFUSED_PATH).toBe("/auth/error?error=LinkNotConfirmed");
});

it("replaces the redirect of a request in which a refusal was noted", async () => {
  const handler = withLinkRefusalPage(async () => {
    // The gate runs after awaits of Auth.js, inside the same request.
    await tick();
    noteLinkRefusal();
    return Response.redirect(CONFIGURATION_ERROR);
  });

  const response = await handler(callback());

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(REFUSAL_PAGE);
  // A redirect, and nothing of the answer it replaces.
  expect(response.headers.get("set-cookie")).toBeNull();
});

it("keeps the origin of the redirect it replaces", async () => {
  const handler = withLinkRefusalPage(async () => {
    noteLinkRefusal();
    return Response.redirect(
      "https://app.example.com/en/auth/error?error=Configuration",
    );
  });

  const response = await handler(callback());

  expect(response.headers.get("location")).toBe(
    "https://app.example.com/auth/error?error=LinkNotConfirmed",
  );
});

it("returns the handler's own answer when no refusal was noted", async () => {
  const answer = Response.redirect("http://localhost:3000/en/account");
  const handler = withLinkRefusalPage(async () => answer);

  await expect(handler(callback())).resolves.toBe(answer);
});

it("returns the handler's own answer when a refusal was noted and the answer is no redirect", async () => {
  // What Auth.js answers to a request that asks for the URL as JSON.
  const answer = Response.json({ url: CONFIGURATION_ERROR });
  const handler = withLinkRefusalPage(async () => {
    noteLinkRefusal();
    return answer;
  });

  await expect(handler(callback())).resolves.toBe(answer);
});

it("hands the request to the handler", async () => {
  const seen: NextRequest[] = [];
  const handler = withLinkRefusalPage(async (request) => {
    seen.push(request);
    return new Response(null, { status: 204 });
  });
  const request = callback();

  await handler(request);

  expect(seen).toEqual([request]);
  expect(seen[0]).toBe(request);
});

it("keeps two requests that overlap apart: only the one with the refusal is replaced", async () => {
  let refusedMayAnswer = () => {};
  const refusedWaits = new Promise<void>((resolve) => {
    refusedMayAnswer = resolve;
  });
  const refused = withLinkRefusalPage(async () => {
    noteLinkRefusal();
    await refusedWaits;
    return Response.redirect(CONFIGURATION_ERROR);
  });
  const otherAnswer = Response.redirect(CONFIGURATION_ERROR);
  const other = withLinkRefusalPage(async () => {
    await tick();
    return otherAnswer;
  });

  // The other request starts after the refusal was noted and ends before the
  // refused one answers.
  const refusedResponse = refused(callback());
  await tick();
  const otherResponse = await other(callback());
  refusedMayAnswer();

  expect(otherResponse).toBe(otherAnswer);
  expect((await refusedResponse).headers.get("location")).toBe(REFUSAL_PAGE);
});

it("a refusal noted outside a wrapped request is ignored", async () => {
  expect(() => noteLinkRefusal()).not.toThrow();

  // It did not leak into the next request either.
  const answer = Response.redirect(CONFIGURATION_ERROR);
  const handler = withLinkRefusalPage(async () => answer);
  await expect(handler(callback())).resolves.toBe(answer);
});

it("a handler that fails still fails", async () => {
  const handler = withLinkRefusalPage(async () => {
    noteLinkRefusal();
    throw new Error("handler failed");
  });

  await expect(handler(callback())).rejects.toThrow("handler failed");
});
