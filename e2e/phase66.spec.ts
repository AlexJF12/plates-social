import { createHmac } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";

// Phase 6.6: the sign-in typeahead (Bluesky stubbed, nothing leaves the
// machine) and the five-tab bar.

const TYPEAHEAD = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead*";

const actors = [
  { did: "did:plc:e2ealice0000000000000000", handle: "alice.bsky.social", displayName: "Alice" },
  { did: "did:plc:e2ealiceb000000000000000", handle: "alicebakes.bsky.social" },
];

// Record what sign-in is started with, without contacting any PDS.
async function stubLogin(page: Page) {
  const handles: string[] = [];
  await page.route("**/oauth/login", async (route) => {
    handles.push(route.request().postDataJSON().handle);
    await route.fulfill({ status: 400, json: { error: "Stubbed sign-in" } });
  });
  return handles;
}

test("typeahead: suggestions appear above the field; one tap starts sign-in", async ({ page }) => {
  const queries: string[] = [];
  await page.route(TYPEAHEAD, (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q")!);
    return route.fulfill({ json: { actors } });
  });
  const handles = await stubLogin(page);
  await page.goto("/");
  const box = page.getByRole("combobox", { name: "Your Bluesky handle" });

  await box.pressSequentially("a");
  await page.waitForTimeout(400);
  expect(queries).toEqual([]); // under 2 characters: no request

  await box.pressSequentially("li");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(box).toHaveAttribute("aria-expanded", "true");
  expect(queries).toEqual(["ali"]); // debounced: one request, not one per key
  await expect(page.getByRole("option")).toHaveCount(2);

  // Opens above the field (the iOS keyboard covers what's below).
  const [l, f] = [await list.boundingBox(), await box.boundingBox()];
  expect(l!.y + l!.height).toBeLessThanOrEqual(f!.y);
  // Rows are at least 44px tall.
  for (const o of await page.getByRole("option").all()) expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "test-results/phase66-typeahead-375.png" });

  await page.getByRole("option", { name: /alicebakes/ }).click();
  await expect.poll(() => handles).toEqual(["alicebakes.bsky.social"]);
  await expect(box).toHaveValue("alicebakes.bsky.social");
  await expect(page.locator("form").getByRole("alert")).toHaveText("Stubbed sign-in");
});

test("typeahead: keyboard, a leading @, and Escape", async ({ page }) => {
  const queries: string[] = [];
  await page.route(TYPEAHEAD, (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q")!);
    return route.fulfill({ json: { actors } });
  });
  const handles = await stubLogin(page);
  await page.goto("/");
  const box = page.getByRole("combobox");
  await box.fill("@alice");
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(queries).toEqual(["alice"]);

  await box.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await box.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await box.press("ArrowDown");
  await expect(page.getByRole("option", { name: /alicebakes/ })).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect.poll(() => handles).toEqual(["alicebakes.bsky.social"]);
});

test("typeahead failing never blocks sign-in", async ({ page }) => {
  let failed = 0;
  await page.route(TYPEAHEAD, (route) => {
    failed++;
    return route.fulfill({ status: 500, body: "down" });
  });
  const handles = await stubLogin(page);
  await page.goto("/");
  await page.getByRole("combobox").fill("alice.bsky.social");
  await expect.poll(() => failed).toBe(1);
  await expect(page.getByRole("listbox")).toBeHidden();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(() => handles).toEqual(["alice.bsky.social"]);
});

test("typeahead: an older response arriving late is ignored", async ({ page }) => {
  await page.route(TYPEAHEAD, async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "al") await new Promise((r) => setTimeout(r, 800));
    return route
      .fulfill({ json: { actors: [{ did: `did:plc:e2e${q}`, handle: `${q}-result.test` }] } })
      .catch(() => {}); // the stale request was aborted
  });
  await page.goto("/");
  const box = page.getByRole("combobox");
  await box.fill("al");
  await page.waitForTimeout(300); // "al" is in flight
  await box.fill("alex");
  await expect(page.getByRole("option")).toHaveText([/@alex-result\.test$/]);
  await page.waitForTimeout(800);
  await expect(page.getByRole("option")).toHaveText([/@alex-result\.test$/]);
});

// Signed-in pages need a session cookie. It's minted here, in the test
// context only, for a test DID with no account anywhere (no PDS is
// contacted), from the local SESSION_SECRET.
function sessionCookie() {
  const secret = process.env.SESSION_SECRET ?? (process.loadEnvFile(".env.local"), process.env.SESSION_SECRET);
  const did = "did:plc:e2etabbar00000000000000";
  return `${did}.${createHmac("sha256", secret!).update(did).digest("base64url")}`;
}

test("five tabs at 375px, each ≥ 44px wide and active on its own routes", async ({ page, context }) => {
  await context.addCookies([{ name: "session", value: sessionCookie(), url: "http://127.0.0.1:3000" }]);
  await page.addInitScript(() => localStorage.setItem("installHintDismissed", "1"));
  await page.goto("/search");
  const nav = page.getByRole("navigation").last();
  const tabs = nav.getByRole("link");
  await expect(tabs).toHaveText(["Feed", "Search", "Log", "Best", "Profile"]);
  for (const t of await tabs.all()) expect((await t.boundingBox())!.width).toBeGreaterThanOrEqual(44);

  const active = () => nav.locator('[aria-current="page"]');
  await expect(active()).toHaveText("Search");
  // Best opens the current month in the browser's zone.
  await nav.getByRole("link", { name: "Best" }).click();
  await expect(page).toHaveURL(/\/best\/\d{4}-\d{2}$/);
  await expect(active()).toHaveText("Best");
  await page.goto("/best");
  await expect(page).toHaveURL(/\/best\/\d{4}-\d{2}$/);
  await nav.getByRole("link", { name: "Feed" }).dispatchEvent("click");
  await expect(active()).toHaveText("Feed");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await page.goto("/search");
  await page.screenshot({ path: "test-results/phase66-tabbar-375.png" });
});
