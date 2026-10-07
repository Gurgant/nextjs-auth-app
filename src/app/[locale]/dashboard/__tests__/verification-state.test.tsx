/**
 * The user dashboard says whether the e-mail address of the account is
 * verified. The page is hardcoded English (see the README), and it names the
 * two states as the account page does in English: "Verified" and
 * "Unverified" (Account.verified and Account.unverified of
 * messages/en.json). It used to say "Not Verified" for the second.
 *
 * The page is a server component: it is awaited and its result rendered, with
 * the session that auth() would give.
 */
import { render, screen } from "@testing-library/react";
import enMessages from "../../../../../messages/en.json";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

import UserDashboardPage from "../user/page";

async function open(emailVerified: Date | null) {
  mockAuth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      role: "USER",
      emailVerified,
    },
  });
  render(
    await UserDashboardPage({ params: Promise.resolve({ locale: "en" }) }),
  );
}

const { verified, unverified } = enMessages.Account;

it("the two words are the ones of the account page", () => {
  expect([verified, unverified]).toEqual(["Verified", "Unverified"]);
});

it("an address that is not verified is called unverified, in the word of the account page", async () => {
  await open(null);

  expect(screen.getByText(unverified)).toBeInTheDocument();
  expect(screen.queryByText(verified)).toBeNull();
  expect(document.body.textContent).not.toMatch(/Not Verified/i);
});

it("a verified address is called verified", async () => {
  await open(new Date("2026-01-01T00:00:00Z"));

  expect(screen.getByText(verified)).toBeInTheDocument();
  expect(screen.queryByText(unverified)).toBeNull();
});
