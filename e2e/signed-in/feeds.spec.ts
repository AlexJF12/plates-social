import type { Page } from "@playwright/test";
import { LONELY, MIRA, TOMAS, cookUri, fixtureImage, insertCook, rk } from "../support/fixtures";
import { expect, stubWrite, test } from "../support/signedIn";

// Feeds, kudos on feed cards and pull to refresh (Phase 6.7).

const card = (page: Page, dish: string) => page.getByTestId("cook-card").filter({ hasText: dish });

async function scrollToEnd(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 20_000);
    if (await page.getByText("You're all caught up.").isVisible()) return;
    await page.waitForTimeout(400);
  }
}

test("Following: the viewer's and followed people's cooks, paged to the end", async ({ page }) => {
  await page.goto("/following");
  await expect(card(page, "Sourdough toast")).toBeVisible(); // own
  await expect(card(page, "Braised short ribs")).toBeVisible(); // Mira, followed
  await expect(card(page, "Fish tacos")).toHaveCount(0); // Tomás, not followed
  await scrollToEnd(page);
  // Own 2 + Mira's 24.
  await expect(page.getByTestId("cook-card")).toHaveCount(26);
  await expect(page.getByText("You're all caught up.")).toBeVisible();
});

test.describe("an account that follows nobody", () => {
  test.use({ as: LONELY.did });
  test("Following is empty and points to the global feed", async ({ page }) => {
    await page.goto("/following");
    await expect(page.getByRole("heading", { name: "Follow people to fill this feed" })).toBeVisible();
  });
});

test("Global pages to the end with no repeats", async ({ page }) => {
  await page.goto("/global");
  await scrollToEnd(page);
  const dishes = await page.getByTestId("cook-card").locator("h2").allTextContents();
  expect(new Set(dishes).size).toBe(dishes.length);
  for (const d of ["Braised short ribs", "Fish tacos", "Tomato galette no. 3", "Chicken soup no. 23"]) expect(dishes).toContain(d);
});

test.describe("kudos on feed cards", () => {
  test("give: pending, then on with the new count; the cook page and Back agree", async ({ page }) => {
    const log = await stubWrite(page, "POST", "/api/kudos", () => ({ json: { uri: "x" }, delay: 600 }));
    await page.goto("/global");
    const button = card(page, "Lemon tart").getByTestId("card-kudos");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(button).toHaveAccessibleName("Give kudos, 0 so far");
    await button.click();
    await expect(button).toBeDisabled(); // pending
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toBeEnabled();
    await expect(button).toHaveAccessibleName("Remove your kudos, 1 so far");
    expect(log).toHaveLength(1);
    expect(log[0].body).toMatchObject({ cook: cookUri(TOMAS.did, rk("tart")), rkey: expect.any(String) });

    // The stub wrote nothing, so the server still says "not given"; the
    // app remembers the confirmed toggle.
    await card(page, "Lemon tart").locator("h2").click();
    await expect(page.getByRole("button", { name: "Kudos given" })).toBeVisible();
    await expect(page.getByTestId("kudos-count")).toHaveText("1 kudos");
    await page.goBack();
    await expect(card(page, "Lemon tart").getByTestId("card-kudos")).toHaveAttribute("aria-pressed", "true");
  });

  test("a failed write shows an error, stays off, and the retry reuses the rkey", async ({ page }) => {
    const log = await stubWrite(page, "POST", "/api/kudos", (_, n) => (n === 1 ? { status: 502, json: { error: "down" } } : { json: {} }));
    await page.goto("/global");
    const c = card(page, "Miso soup");
    const button = c.getByTestId("card-kudos");
    await button.click();
    await expect(c.getByRole("alert")).toHaveText("Couldn't give kudos. Try again.");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(c.getByRole("alert")).toHaveCount(0);
    expect(log.map((l) => (l.body as { rkey: string }).rkey)).toEqual([expect.any(String), (log[0].body as { rkey: string }).rkey]);
  });

  test("remove: an existing kudos turns off", async ({ page }) => {
    const log = await stubWrite(page, "DELETE", "/api/kudos", () => ({ json: { deleted: "x" } }));
    await page.goto("/global");
    const button = card(page, "Fish tacos").getByTestId("card-kudos");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(button).toHaveAccessibleName("Give kudos, 0 so far");
    expect(log[0].body).toEqual({ cook: cookUri(TOMAS.did, rk("tacos")) });
  });

  test("your own cook shows a count, not a button", async ({ page }) => {
    await page.goto("/global");
    const own = card(page, "Weeknight dal");
    await expect(own.getByTestId("card-kudos")).toHaveCount(0);
    await expect(own.getByRole("img", { name: "1 kudos" })).toBeVisible();
    // Buttons are 44px tall at least.
    const box = await card(page, "Fish tacos").getByTestId("card-kudos").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});

test.describe("pull to refresh", () => {
  // Touch drags through the DevTools protocol (Chromium).
  async function drag(page: Page, dy: number, dx = 0, hold?: () => Promise<void>) {
    const cdp = await page.context().newCDPSession(page);
    const at = (x: number, y: number) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(180, 250) });
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(180 + (dx * i) / steps, 250 + (dy * i) / steps) });
    }
    await hold?.();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  }

  test("a short pull springs back; a long one refetches and shows a new cook", async ({ page, db }) => {
    let fetches = 0;
    page.on("request", (r) => r.url().includes("/api/feed") && fetches++);
    await page.goto("/following");
    await expect(card(page, "Sourdough toast")).toBeVisible();
    const indicator = page.getByTestId("pull-indicator");

    await drag(page, 70, 0, async () => expect(indicator).toHaveAttribute("data-state", "pulling"));
    await expect(indicator).toHaveAttribute("data-state", "idle");
    await page.waitForTimeout(300);
    expect(fetches).toBe(0);

    // A sideways swipe (carousel) doesn't pull.
    await drag(page, 20, 160);
    await expect(indicator).toHaveAttribute("data-state", "idle");

    await insertCook(db, { author: MIRA.did, rkey: rk("fresh"), dish: "Freshly pulled bread", meal: "bread", cookedAt: new Date().toISOString(), img: fixtureImage() });
    await expect(card(page, "Freshly pulled bread")).toHaveCount(0);
    await drag(page, 220, 0, async () => expect(indicator).toHaveAttribute("data-state", "armed"));
    await expect(card(page, "Freshly pulled bread")).toBeVisible();
    expect(fetches).toBe(1);
    await expect(page.getByTestId("cook-card").first()).toContainText("Freshly pulled bread");
    await expect(indicator).toHaveAttribute("data-state", "idle");
    await db.query("delete from cook where uri = $1", [cookUri(MIRA.did, rk("fresh"))]);
  });

  test("a failed refresh keeps the list and says so", async ({ page }) => {
    await page.route("**/api/feed?**", (route) => route.fulfill({ status: 500, json: { error: "down" } }));
    await page.goto("/following");
    await expect(card(page, "Sourdough toast")).toBeVisible();
    await drag(page, 220);
    await expect(page.getByText("Couldn't refresh. Pull down to try again.")).toBeVisible();
    await expect(card(page, "Sourdough toast")).toBeVisible();
  });
});
