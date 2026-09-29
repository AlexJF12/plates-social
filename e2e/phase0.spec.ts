import { expect, test } from "@playwright/test";

test("sign-in page renders at 375px", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cooklog" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  await page.getByLabel("Bluesky / atproto handle").fill("alice.bsky.social");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "test-results/phase0-login-375.png", fullPage: true });
});

test("unknown handle shows an error, not a redirect", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Bluesky / atproto handle")
    .fill("this-handle-does-not-exist-9f3k.bsky.social");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("signed-out /following redirects to sign-in", async ({ page }) => {
  await page.goto("/following");
  await expect(page).toHaveURL("/");
});

test("manifest and icons are served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: "Cooklog",
    display: "standalone",
    start_url: "/following",
    scope: "/",
  });
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
  }
});

test("head has viewport-fit=cover and apple-touch-icon", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  const apple = page.locator('link[rel="apple-touch-icon"]');
  await expect(apple).toHaveCount(1);
  const href = await apple.getAttribute("href");
  expect((await page.request.get(href!)).ok()).toBeTruthy();
});
