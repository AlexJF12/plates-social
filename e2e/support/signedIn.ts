import { type Page, test as base, expect } from "@playwright/test";
import { Pool } from "pg";
import { VIEWER, loadEnv, sessionCookie } from "./fixtures";

// Signed-in tests: a session cookie for a fixture account, UTC, no install
// hint, and a safety net so no write can reach a PDS. Every POST/DELETE to
// a write route must be stubbed by the test (stubWrite); anything that
// slips through is aborted and fails the test.

const WRITES = /\/api\/(kudos|comment|cook|blob|follow(\/import)?)(\?.*)?$/;

type Stubbed = { method: string; path: string; body: unknown };

// (Fixture callbacks name Playwright's `use` "provide": the React hooks lint
// rule would take `use` for React's.)
export const test = base.extend<{ as: string; db: Pool; needsFixtures: void }>({
  // Every signed-in test skips when global-setup couldn't create fixtures.
  needsFixtures: [
    async ({}, provide, testInfo) => {
      testInfo.skip(!process.env.E2E_FIXTURES, "No fixtures (needs .env.local and the local Postgres; see README e2e)");
      await provide();
    },
    { auto: true },
  ],
  as: [VIEWER.did, { option: true }],
  timezoneId: "UTC",
  context: async ({ context, as, baseURL }, provide) => {
    await context.addCookies([{ name: "session", value: sessionCookie(as), url: baseURL! }]);
    await context.addInitScript(() => {
      try {
        localStorage.setItem("installHintDismissed", "1");
      } catch {}
    });
    await provide(context);
  },
  page: async ({ page }, provide) => {
    const unstubbed: string[] = [];
    await page.route(WRITES, (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.fallback();
      unstubbed.push(`${req.method()} ${new URL(req.url()).pathname}`);
      return route.abort();
    });
    await provide(page);
    expect(unstubbed, "writes that weren't stubbed").toEqual([]);
  },
  db: async ({}, provide) => {
    const pool = new Pool({ connectionString: loadEnv().databaseUrl, max: 1 });
    await provide(pool);
    await pool.end();
  },
});

// Stub one write route. `respond` decides the reply; every request's body is
// recorded in `log`.
export async function stubWrite(
  page: Page,
  method: "POST" | "DELETE",
  path: string,
  respond: (body: Record<string, unknown>, n: number) => { status?: number; json?: unknown; delay?: number },
  log: Stubbed[] = [],
) {
  let n = 0;
  await page.route(`**${path}`, async (route) => {
    const req = route.request();
    if (req.method() !== method) return route.fallback();
    let body: Record<string, unknown> = {};
    try {
      body = req.postDataJSON() ?? {};
    } catch {
      body = { bytes: req.postDataBuffer()?.byteLength ?? 0 }; // a photo upload
    }
    log.push({ method, path, body });
    const r = respond(body, ++n);
    if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
    await route.fulfill({ status: r.status ?? 200, json: r.json ?? {} });
  });
  return log;
}

export { expect };
