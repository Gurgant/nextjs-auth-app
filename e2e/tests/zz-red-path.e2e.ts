import { test, expect } from "@playwright/test";

// Deliberate failure, on a scratch branch only: proves that a failing test
// turns the e2e job red and that its trace, screenshot and video are uploaded.
test("deliberate failure: the red path of the e2e job", async ({ page }) => {
  await page.goto("/en");
  await expect(
    page.getByRole("heading", { name: "this heading does not exist" }),
  ).toBeVisible({ timeout: 3_000 });
});
