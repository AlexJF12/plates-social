import { BEST_MONTH, EARLIEST_MONTH } from "../support/fixtures";
import { expect, test } from "../support/signedIn";

// The Best tab and search.

test("Best: winners per meal, month limits, badges", async ({ page }) => {
  await page.goto(`/best/${BEST_MONTH}`);
  await expect(page.getByRole("heading", { name: "June 2025" })).toBeVisible();
  const rows = page.getByTestId("best-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("Ginger congee");
  await expect(rows.nth(1)).toContainText("No winner yet"); // lunch: Miso soup has no kudos
  await expect(rows.nth(2)).toContainText("Braised short ribs");
  await expect(rows.nth(2).getByLabel("2 kudos")).toBeVisible();
  await expect(page.getByTestId("best-status")).toHaveText("The cook with the most kudos in each meal.");

  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(`/best/${EARLIEST_MONTH}`);
  await expect(page.getByRole("link", { name: "Previous month" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("heading", { name: "No winners in May 2025" })).toBeVisible();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(`/best/${BEST_MONTH}`);

  // Next stops at the current month.
  await page.getByRole("navigation").last().getByRole("link", { name: "Best" }).click();
  await expect(page).toHaveURL(/\/best\/\d{4}-\d{2}$/);
  await expect(page.getByRole("link", { name: "Next month" })).toHaveAttribute("aria-disabled", "true");

  await page.goto("/global");
  await expect(page.getByTestId("cook-card").filter({ hasText: "Braised short ribs" }).getByTestId("best-badge")).toHaveText(
    "Best dinner, Jun 2025",
  );
});

test("Search: dishes, people, meal chips, paging, Back keeps the query", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Find a cook" })).toBeVisible();
  const box = page.getByRole("searchbox");

  await box.fill("galette");
  await expect(page).toHaveURL("/search?q=galette");
  await expect(page.getByTestId("cook-card")).toHaveCount(7);

  await box.fill("mira");
  await expect(page.getByRole("region", { name: "People" }).getByRole("link")).toHaveText([/Mira Adeyemi/]);

  await box.fill("galette");
  await page.getByRole("button", { name: "Dinner" }).click();
  await expect(page.getByRole("heading", { name: "No cooks match with this meal" })).toBeVisible();
  await page.getByRole("button", { name: "Search all meals" }).click();
  await expect(page.getByTestId("cook-card")).toHaveCount(7);

  // "no. " is in all 23 of Mira's numbered cooks: two pages.
  await box.fill("no. ");
  await expect(page.getByTestId("cook-card")).toHaveCount(20);
  await page.mouse.wheel(0, 50_000);
  await expect(page.getByTestId("cook-card")).toHaveCount(23);

  await box.fill("short ribs");
  await page.getByTestId("cook-card").locator("h2").click();
  await expect(page).toHaveURL(/\/cook\//);
  await page.goBack();
  await expect(box).toHaveValue("short ribs");
  await expect(page.getByTestId("cook-card")).toHaveCount(1);
});
