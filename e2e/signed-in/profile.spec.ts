import type { Page } from "@playwright/test";
import { MIRA, MIRA_COOKS, TOMAS, VIEWER } from "../support/fixtures";
import { expect, stubWrite, test } from "../support/signedIn";

// Profiles: stats, Best cooks, follow, paging.

test("your profile: stats in UTC, no Best cooks, the import link", async ({ page }) => {
  await page.goto(`/profile/${VIEWER.handle}`);
  await expect(page.getByTestId("profile-name")).toHaveText(VIEWER.name);
  const stats = page.getByTestId("profile-stats");
  await expect(stats.locator("dt")).toHaveText(["cook this week", "cook this month"]);
  await expect(stats.locator("dd")).toHaveText(["1", "1"]);
  await expect(page.getByTestId("best-cooks")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Find people from Bluesky" })).toBeVisible();
});

async function scrollToEnd(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 20_000);
    if (await page.getByText("You're all caught up.").isVisible()) return;
    await page.waitForTimeout(400);
  }
}

test("someone's profile: Best cooks link to the cook, all their cooks page in", async ({ page }) => {
  await page.goto(`/profile/${MIRA.handle}`);
  const best = page.getByTestId("best-cooks");
  await expect(best.getByRole("link")).toHaveText(["Dinner, Jun 2025"]);
  await scrollToEnd(page);
  await expect(page.getByTestId("cook-card")).toHaveCount(MIRA_COOKS);
  await page.mouse.wheel(0, -100_000);
  await best.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Braised short ribs" })).toBeVisible();
});

test("unfollow and follow", async ({ page }) => {
  const del = await stubWrite(page, "DELETE", "/api/follow", () => ({ json: { deleted: "x" } }));
  const post = await stubWrite(page, "POST", "/api/follow", () => ({ json: { uri: "x" }, delay: 300 }));
  await page.goto(`/profile/${MIRA.handle}`);
  await page.getByRole("button", { name: "Following" }).click();
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  expect(del[0].body).toEqual({ subject: MIRA.did });

  await page.goto(`/profile/${TOMAS.handle}`);
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  expect(post[0].body).toMatchObject({ subject: TOMAS.did });
});
