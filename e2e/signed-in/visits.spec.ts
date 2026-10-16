import { type Page, test as base } from "@playwright/test";
import { BEST_MONTH, KAI, MIRA, TOMAS, VIEWER, rk, visitUri } from "../support/fixtures";
import { expect, stubWrite, test } from "../support/signedIn";

// Eating out (Phase 6.8): visit cards, the visit page, logging and deleting
// a visit, search, the eating-out line, and the re-consent path. Every write
// is stubbed.

const visitCard = (page: Page, name: string) => page.getByTestId("visit-card").filter({ hasText: name });
// A visit shows a date, never a clock time or a relative time.
const TIME = /\d:\d\d|\bago\b|\bnow\b|\d+[mh]\b/;

test("visit cards sit in the feeds next to cooks, with a date and never a time", async ({ page }) => {
  await page.goto("/global");
  const lilia = visitCard(page, "Lilia");
  await expect(lilia).toBeVisible();
  await expect(lilia.getByTestId("ate-out")).toHaveText("Ate out");
  await expect(lilia.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  // The rating also sits over the photo, hidden from screen readers (the stars carry it).
  await expect(lilia.getByTestId("rating-badge")).toHaveText("5");
  await expect(lilia.getByTestId("rating-badge")).toHaveAttribute("aria-hidden", "true");
  await expect(lilia).toContainText("Williamsburg, Brooklyn");
  await expect(lilia.locator("header time")).toHaveText("Mon 16 Jun 2025");
  expect(await lilia.locator("header").innerText()).not.toMatch(TIME);
  // Today's visit says so, still without a time.
  await expect(visitCard(page, "Via Carota").locator("header time")).toHaveText("Today");
  await expect(page.getByTestId("cook-card").first()).toBeVisible();

  await page.goto("/following");
  await expect(visitCard(page, "Lilia")).toBeVisible(); // Mira, followed
  await expect(visitCard(page, "Via Carota")).toBeVisible(); // own
  await expect(visitCard(page, "Los Cuates")).toHaveCount(0); // Tomás, not followed
});

test("kudos on a visit card", async ({ page }) => {
  const log = await stubWrite(page, "POST", "/api/kudos", () => ({ json: { uri: "x" }, delay: 300 }));
  await page.goto("/global");
  const button = visitCard(page, "Los Cuates").getByTestId("card-kudos");
  await expect(button).toHaveAccessibleName("Give kudos, 0 so far");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAccessibleName("Remove your kudos, 1 so far");
  expect(log[0].body).toMatchObject({ cook: visitUri(TOMAS.did, rk("cuates")), rkey: expect.any(String) });
  // Your own visit is a count, not a button.
  await expect(visitCard(page, "Via Carota").getByTestId("card-kudos")).toHaveCount(0);
});

test("the visit page: photos, stars, the date only, review, kudos, comments", async ({ page }) => {
  await page.goto(`/visit/${MIRA.did}/${rk("lilia")}`);
  await expect(page.getByRole("heading", { name: "Lilia" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  await expect(page.getByTestId("visit-date")).toHaveText("Visited Mon 16 Jun 2025");
  await expect(page.getByRole("main").locator("img[alt='Lilia (illustration)']")).toHaveCount(2);
  await expect(page.getByText("The sheep's milk agnolotti")).toBeVisible();
  await expect(page.getByTestId("kudos-count")).toHaveText("3 kudos");
  await expect(page.getByRole("button", { name: "Kudos given" })).toBeVisible();
  await expect(page.getByText("Adding it to my list.")).toBeVisible();
  // Someone else's: share, no delete.
  await expect(page.getByRole("button", { name: "Share visit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete visit" })).toHaveCount(0);
  expect(await page.getByRole("main").locator("section").first().innerText()).not.toMatch(TIME);
});

test("comment on a visit", async ({ page }) => {
  const log = await stubWrite(page, "POST", "/api/comment", () => ({
    json: { uri: "at://x/y/z", author: { did: VIEWER.did, handle: VIEWER.handle, displayName: VIEWER.name, avatarCid: null }, text: "Going Friday", sortAt: new Date().toISOString() },
  }));
  await page.goto(`/visit/${MIRA.did}/${rk("lilia")}`);
  await page.getByPlaceholder("Add a comment").fill("Going Friday");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Going Friday")).toBeVisible();
  expect(log[0].body).toMatchObject({ cook: visitUri(MIRA.did, rk("lilia")), text: "Going Friday" });
});

test("deleting your own visit asks first, then goes to your profile", async ({ page }) => {
  const log = await stubWrite(page, "DELETE", "/api/visit", () => ({ json: { deleted: "x" } }));
  await page.goto(`/visit/${VIEWER.did}/${rk("carota")}`);
  await page.getByRole("button", { name: "Delete visit" }).click();
  await expect(page.getByRole("heading", { name: "Delete this visit?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(`/profile/${VIEWER.handle}`);
  expect(log.map((l) => l.body)).toEqual([{ rkey: rk("carota") }]);
});

test("deleting a visit on a session without the visit scope offers Sign in again", async ({ page }) => {
  await stubWrite(page, "DELETE", "/api/visit", () => ({ status: 403, json: { error: "Sign in again", reauth: true } }));
  const logins: unknown[] = [];
  await page.route("**/oauth/login", async (route) => {
    logins.push(route.request().postDataJSON());
    await route.fulfill({ json: { redirectUrl: "/following" } });
  });
  await page.goto(`/visit/${VIEWER.did}/${rk("carota")}`);
  await page.getByRole("button", { name: "Delete visit" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Sign in again" }).click();
  await expect(page).toHaveURL("/following");
  expect(logins).toEqual([{ handle: VIEWER.did, next: `/visit/${VIEWER.did}/${rk("carota")}` }]);
});

test.describe("logging a visit", () => {
  const blob = { $type: "blob", ref: { $link: "bafkreie2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e" }, mimeType: "image/jpeg", size: 1000 };

  test("validation, the star control by keyboard, a failure then a retry with the same rkey", async ({ page }) => {
    const blobs = await stubWrite(page, "POST", "/api/blob", () => ({ json: { blob, width: 1600, height: 1200 }, delay: 300 }));
    const posts = await stubWrite(page, "POST", "/api/visit", (_, n) =>
      n === 1 ? { status: 502, json: { error: "Posting to your PDS failed" } } : { json: { uri: visitUri(VIEWER.did, rk("newvisit")), cid: "x" } },
    );
    await page.goto("/log");
    await expect(page.getByRole("button", { name: "Cooked it" })).toHaveAttribute("aria-pressed", "true");

    // Photos, meal and date are shared between the modes.
    await page.locator('input[type="file"]').setInputFiles(process.env.E2E_PHOTO!);
    await expect(page.getByRole("button", { name: "Remove photo 1" })).toBeVisible();
    await page.getByRole("button", { name: "Lunch" }).click();
    await page.getByRole("button", { name: "Ate out" }).click();
    await expect(page.getByRole("button", { name: "Remove photo 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lunch" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByPlaceholder("What did you cook?")).toHaveCount(0);

    const submit = page.getByRole("button", { name: "Post visit" });
    await expect(submit).toBeDisabled();
    await page.getByPlaceholder("Where did you eat?").fill("Lilia");
    await page.getByPlaceholder("Neighbourhood or city").fill("Brooklyn");
    await expect(submit).toBeDisabled(); // no rating yet

    // Keyboard: one tab stop, arrows move and select.
    const stars = page.getByRole("radiogroup", { name: "Rating" });
    await expect(stars.getByRole("radio")).toHaveCount(5);
    await stars.getByRole("radio", { name: "1 star" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(stars.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    await expect(stars.getByRole("radio", { name: "4 stars" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(stars.getByRole("radio", { name: "3 stars" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("End");
    await expect(stars.getByRole("radio", { name: "5 stars" })).toHaveAttribute("aria-checked", "true");
    await expect(stars.locator('[tabindex="0"]')).toHaveCount(1);
    await page.getByPlaceholder("What did you have? Would you go back?").fill("The agnolotti.");
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("Posting to your PDS failed")).toBeVisible();
    await expect(page.getByPlaceholder("Where did you eat?")).toHaveValue("Lilia");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page).toHaveURL(`/visit/${VIEWER.did}/${rk("newvisit")}`);
    expect(blobs).toHaveLength(1);
    expect(posts.map((p) => p.body)).toEqual([
      expect.objectContaining({
        restaurantName: "Lilia",
        restaurantArea: "Brooklyn",
        rating: 5,
        review: "The agnolotti.",
        mealType: "lunch",
        visitedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/),
        images: [expect.objectContaining({ width: 1600, height: 1200 })],
        rkey: expect.any(String),
      }),
      expect.objectContaining({ rkey: (posts[0].body as { rkey: string }).rkey }),
    ]);
  });

  test("the mode is remembered for the session", async ({ page }) => {
    await page.goto("/log");
    await page.getByRole("button", { name: "Ate out" }).click();
    await page.goto("/following");
    await page.goto("/log");
    await expect(page.getByRole("button", { name: "Ate out" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByPlaceholder("Where did you eat?")).toBeVisible();
  });

  test("a session without the visit scope gets Sign in again, back to /log", async ({ page }) => {
    await stubWrite(page, "POST", "/api/blob", () => ({ json: { blob, width: 1600, height: 1200 } }));
    await stubWrite(page, "POST", "/api/visit", () => ({ status: 403, json: { error: "Sign in again", reauth: true } }));
    const logins: unknown[] = [];
    await page.route("**/oauth/login", async (route) => {
      logins.push(route.request().postDataJSON());
      await route.fulfill({ json: { redirectUrl: "/following" } });
    });
    await page.goto("/log");
    await page.getByRole("button", { name: "Ate out" }).click();
    await page.locator('input[type="file"]').setInputFiles(process.env.E2E_PHOTO!);
    await page.getByPlaceholder("Where did you eat?").fill("Lilia");
    await page.getByRole("radio", { name: "4 stars" }).click();
    await page.getByRole("button", { name: "Dinner" }).click();
    await page.getByRole("button", { name: "Post visit" }).click();
    await expect(page.getByText("Posting visits needs a new permission.")).toBeVisible();
    await page.getByRole("button", { name: "Sign in again" }).click();
    await expect(page).toHaveURL("/following");
    expect(logins).toEqual([{ handle: VIEWER.did, next: "/log" }]);
  });
});

test("search finds restaurants by name and area, mixed with cooks", async ({ page }) => {
  await page.goto("/search?q=cuates");
  await expect(visitCard(page, "Los Cuates")).toBeVisible();
  await page.goto("/search?q=williamsburg");
  await expect(visitCard(page, "Lilia")).toBeVisible();
  await page.goto("/search?q=lilia&meal=lunch");
  await expect(page.getByRole("heading", { name: "Nothing matches with this meal" })).toBeVisible();
});

test("the eating-out line: on a profile with visits this month, not on one without", async ({ page }) => {
  await page.goto(`/profile/${VIEWER.handle}`);
  await expect(page.getByTestId("eating-out")).toHaveText("Ate out 1 this week · 1 this month");
  // Cook stats are cooks only.
  await expect(page.getByTestId("profile-stats").locator("dd")).toHaveText(["1", "1"]);
  await page.goto(`/profile/${KAI.handle}`);
  await expect(page.getByTestId("profile-stats")).toBeVisible();
  await expect(page.getByTestId("eating-out")).toHaveCount(0);
  // A profile's feed has their visits too.
  await page.goto(`/profile/${MIRA.handle}`);
  await expect(visitCard(page, "Lilia")).toBeVisible();
});

test("a winning-looking visit never shows on the Best tab", async ({ page }) => {
  await page.goto(`/best/${BEST_MONTH}`);
  const rows = page.getByTestId("best-row");
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(2)).toContainText("Braised short ribs"); // dinner: not Lilia's 3 kudos
  await expect(page.getByText("Lilia")).toHaveCount(0);
});

base.describe("signed out", () => {
  base("the visit page is public, read-only, and Sign in comes back to it", async ({ page }) => {
    base.skip(!process.env.E2E_FIXTURES, "No fixtures");
    const path = `/visit/${MIRA.did}/${rk("lilia")}`;
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Lilia" })).toBeVisible();
    await expect(page.getByTestId("visit-date")).toHaveText("Visited Mon 16 Jun 2025");
    await expect(page.getByTestId("public-counts")).toHaveText("3 kudos · 1 comment");
    await expect(page.getByRole("button", { name: "Share visit" })).toHaveCount(0);
    await expect(page.getByText("Adding it to my list.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", `/?next=${encodeURIComponent(path)}`);
    // Link previews and no indexing.
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Lilia, Williamsburg, Brooklyn · Mira Adeyemi");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
