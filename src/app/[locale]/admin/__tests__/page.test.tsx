/**
 * The last section of the admin page holds one link, to the metrics
 * endpoint. It is headed "Diagnostics": a heading in the plural over a single
 * card read as a page that was not finished. The page is a server component
 * (hardcoded English, see the README): it is awaited and its result
 * rendered, with the session that auth() would give and counts and rows in
 * place of the database.
 */
import { render, screen, within } from "@testing-library/react";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "user-1",
          email: "admin@example.com",
          name: "Admin User",
          role: "ADMIN",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]),
    },
    session: { count: jest.fn().mockResolvedValue(0) },
    securityEvent: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import AdminDashboardPage from "../page";

async function open() {
  mockAuth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN",
    },
  });
  render(
    await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }),
  );
}

const sectionHeadings = () =>
  screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

it("heads its sections 'Recent Users', 'Recent Security Events' and 'Diagnostics'", async () => {
  await open();

  expect(sectionHeadings()).toEqual([
    "Recent Users",
    "Recent Security Events",
    "Diagnostics",
  ]);
  expect(screen.queryByText("Admin Actions")).toBeNull();
});

it("keeps the one link of that section: 'System Metrics', to the metrics endpoint, in a new tab", async () => {
  await open();

  const section = screen
    .getByRole("heading", { level: 2, name: "Diagnostics" })
    .closest("div");
  expect(section).not.toBeNull();
  const links = within(section as HTMLElement).getAllByRole("link");

  expect(links.map((link) => link.textContent)).toEqual(["System Metrics"]);
  expect(links[0]).toHaveAttribute("href", "/api/admin/metrics");
  expect(links[0]).toHaveAttribute("target", "_blank");
  expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  // The page has no other link: the section holds all of them.
  expect(screen.getAllByRole("link")).toEqual(links);
});
