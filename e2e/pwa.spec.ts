import { expect, test } from "@playwright/test";

// §7.1: service worker (offline fallback only) and the install hint.
// The project's device is an iPhone, so the iOS hint applies.

test("service worker caches only /offline and serves it when a page can't load", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    }
    return out;
  });
  expect(cached).toEqual(["/offline"]);

  await context.setOffline(true);
  await page.goto("/").catch(() => {});
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Cooklog" })).toBeVisible();
});

test("iOS install hint shows once, and stays dismissed", async ({ page }) => {
  await page.goto("/");
  const hint = page.getByTestId("install-hint");
  await expect(hint).toContainText("tap Share");
  await hint.getByRole("button", { name: "Dismiss" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(hint).toHaveCount(0);
});

test("no install hint inside the installed app", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("install-hint")).toHaveCount(0);
});

test("Android: an early beforeinstallprompt becomes an Install button", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { prompted: number };
    w.prompted = 0;
    // Fired before React hydrates; the inline <head> script must catch it.
    document.addEventListener("DOMContentLoaded", () => {
      const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => void w.prompted++,
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(e);
    });
  });
  await page.goto("/");
  const install = page.getByTestId("install-hint").getByRole("button", { name: "Install" });
  await install.click();
  await expect(page.getByTestId("install-hint")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);
});
