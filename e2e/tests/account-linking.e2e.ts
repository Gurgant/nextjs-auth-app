import { test, expect } from "@playwright/test";
import { apiPost, signInViaApi } from "../support/app";
import { createTestUser, openTestDatabase } from "../support/db";

/*
 * Linking Google, up to the point where Google takes over (the suite never
 * clicks the Google button). The account page first sends the password to
 * POST /api/auth/link-account/initiate and reads `success` / `error` from the
 * answer (src/components/account/oauth-account-linking.tsx); then it starts
 * the Google sign-in, and Auth.js links the account when Google returns.
 *
 * The route used to create a link request and return its token, and a page
 * under /{locale}/link-account/confirm/{token} completed that request without
 * a session. Both are gone: the route hands out no token, and the page's URL
 * answers 404.
 *
 * Rate-limit budget for this file: 0 registrations, 0 failed sign-ins, 0 2FA
 * codes, 0 wrong link passwords. The user is created in the database
 * (e2e/support/db.ts), so the seeded users stay as other specs expect them.
 */

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

test("the password check before linking Google answers without a token and records one event", async ({
  page,
}) => {
  const user = await createTestUser(db);
  await signInViaApi(page, user);

  const res = await apiPost(page, "/api/auth/link-account/initiate", {
    data: { password: user.password, provider: "google" },
  });

  const events = await db.securityEvent.findMany({
    where: { userId: user.id },
  });

  // One comparison, so that a failure shows the answer and the event together.
  // The event is the route's only trace: nothing is linked yet.
  expect({
    status: res.status(),
    answer: await res.json(),
    events: events.map(({ eventType, success, metadata }) => ({
      eventType,
      success,
      metadata,
    })),
  }).toStrictEqual({
    status: 200,
    answer: { success: true, provider: "google" },
    events: [
      {
        eventType: "account_link_initiated",
        success: true,
        metadata: { provider: "google" },
      },
    ],
  });

  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { accounts: true },
  });
  expect(row.hasGoogleAccount).toBe(false);
  expect(row.accounts.map((account) => account.provider)).toEqual([
    "credentials",
  ]);
});

test("the URL of the removed link-confirmation page answers 404", async ({
  page,
}) => {
  // The shape of the old links: the token was 32 random bytes in hex.
  const path = `/en/link-account/confirm/${"ab".repeat(32)}`;

  const res = await page.goto(path);
  if (!res) throw new Error(`page.goto(${path}) returned no document response`);

  expect(
    res.request().redirectedFrom()?.url(),
    `${path} was redirected`,
  ).toBeUndefined();
  expect(res.status()).toBe(404);
});
