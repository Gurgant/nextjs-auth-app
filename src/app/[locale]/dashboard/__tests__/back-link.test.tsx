/**
 * The link at the top of the user dashboard and of the PRO dashboard leads to
 * the account page of the locale. Its label says so, and it has one arrow:
 * the icon, and no arrow character in the text. The pages are server
 * components (hardcoded English, see the README): each is awaited and its
 * result rendered, with the session that auth() would give.
 */
import { render, screen } from "@testing-library/react";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

import UserDashboardPage from "../user/page";
import ProUserDashboardPage from "../pro/page";

const PAGES = [
  { name: "user dashboard", Page: UserDashboardPage, role: "USER" },
  { name: "PRO dashboard", Page: ProUserDashboardPage, role: "PRO_USER" },
] as const;

describe.each(PAGES)("$name", ({ Page, role }) => {
  async function open(locale: string) {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "reader@example.com",
        name: "Reader",
        role,
        emailVerified: new Date("2026-01-01T00:00:00Z"),
      },
    });
    render(await Page({ params: Promise.resolve({ locale }) }));
  }

  it("has a link named 'Back to account' that leads to the account page of the locale", async () => {
    await open("fr");

    expect(
      screen.getByRole("link", { name: "Back to account" }),
    ).toHaveAttribute("href", "/fr/account");
  });

  it("shows one arrow: the icon of the link, and no arrow character in its text", async () => {
    await open("en");

    const link = screen.getByRole("link", { name: "Back to account" });
    expect(link.querySelectorAll("svg")).toHaveLength(1);
    expect(link.textContent).toBe("Back to account");
    expect(document.body.textContent).not.toMatch(/[←‹⟵]/);
  });

  it("names no 'Main Dashboard': the link never led to one", async () => {
    await open("en");

    expect(document.body.textContent).not.toMatch(/Main Dashboard/);
    // The same search finds a text that the page does show.
    expect(document.body.textContent).toMatch(/Dashboard/);
  });
});
