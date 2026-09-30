// Wipes the index tables and rebuilds them from Tap (§0.14). The recovery
// plan if index data is ever corrupted. Auth tables are left alone.
//
//   pnpm rebuild-index            # dry run: shows what it would do
//   pnpm rebuild-index --yes      # does it
//   pnpm rebuild-index --yes did:plc:… did:plc:…   # plus extra DIDs
//
// Tap has no "list tracked repos" endpoint, so the DIDs to re-sync are
// collected from the index and auth_session *before* the wipe. Removing a
// repo from Tap and adding it back makes Tap backfill it from the PDS and
// redeliver every record to the webhook, which (being idempotent) rebuilds
// the rows. The dev server (or production app) must be running to receive
// them. See README "Rebuilding the index".
import { Tap, formatAdminAuthHeader } from "@atproto/tap";
import { sql } from "kysely";
import { getDb } from "../lib/db/index";

const INDEX_TABLES = ["account", "cook", "kudos", "comment", "follow"] as const;
const BATCH = 100;
const TIMEOUT_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const extraDids = args.filter((a) => a.startsWith("did:"));

const tapUrl = process.env.TAP_URL || "http://127.0.0.1:2480";
const tapPassword = process.env.TAP_ADMIN_PASSWORD;
if (!tapPassword) throw new Error("TAP_ADMIN_PASSWORD is not set");
const tap = new Tap(tapUrl, { adminPassword: tapPassword });
const db = getDb();

async function tapGet(path: string) {
  const res = await fetch(new URL(path, tapUrl), {
    headers: { Authorization: formatAdminAuthHeader(tapPassword!) },
  });
  if (!res.ok) throw new Error(`Tap ${path}: ${res.status}`);
  return res.json();
}

async function counts() {
  const out: Record<string, number> = {};
  for (const t of INDEX_TABLES) {
    const r = await db.selectFrom(t).select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    out[t] = r.n;
  }
  return out;
}

async function collectDids(): Promise<string[]> {
  const dids = new Set<string>(extraDids);
  const add = (rows: { d: string }[]) => rows.forEach((r) => dids.add(r.d));
  add(await db.selectFrom("account").select("did as d").execute());
  add(await db.selectFrom("auth_session").select("key as d").execute());
  for (const t of ["cook", "kudos", "comment", "follow"] as const) {
    add(await db.selectFrom(t).select("authorDid as d").distinct().execute());
  }
  return [...dids].filter((d) => d.startsWith("did:")).sort();
}

// Tap repo states that mean "still backfilling".
const BUSY = new Set(["pending", "desynchronized", "resyncing"]);

async function waitForTap(dids: string[]) {
  const start = Date.now();
  let quiet = 0;
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 2000));
    const states = await Promise.all(
      dids.map(async (d) => {
        try {
          return (await tap.getRepoInfo(d)).state;
        } catch {
          return "unknown";
        }
      }),
    );
    const busy = states.filter((s) => BUSY.has(s)).length;
    const { outbox_buffer } = await tapGet("/stats/outbox-buffer");
    console.log(`  repos still syncing: ${busy}/${dids.length}, events waiting for the webhook: ${outbox_buffer}`);
    // Require a few quiet polls in a row: the outbox can be briefly empty
    // between a repo finishing and its events being queued.
    quiet = busy === 0 && outbox_buffer === 0 ? quiet + 1 : 0;
    if (quiet >= 3) {
      const odd = dids.filter((_, i) => states[i] !== "active");
      if (odd.length) console.log(`  not active (check with GET /info/<did>): ${odd.join(", ")}`);
      return;
    }
  }
  throw new Error("Timed out waiting for Tap; the rebuild may be incomplete. Re-run it.");
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
  console.log(`Database: ${host}\nTap: ${tapUrl}`);
  await tapGet("/health");

  const dids = await collectDids();
  const before = await counts();
  console.log(`Rows now: ${JSON.stringify(before)}`);
  console.log(`Repos to re-sync (${dids.length}):\n  ${dids.join("\n  ")}`);

  if (!confirmed) {
    console.log("\nDry run. Re-run with --yes to wipe the index tables and rebuild.");
    return;
  }

  // One statement, so readers never see a half-wiped index.
  await sql`truncate table ${sql.join(INDEX_TABLES.map((t) => sql.table(t)))}`.execute(db);
  console.log("Index tables wiped.");

  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH);
    await tap.removeRepos(batch);
    await tap.addRepos(batch);
  }
  console.log("Repos re-added to Tap; waiting for backfill…");

  await waitForTap(dids);
  console.log(`Rows before: ${JSON.stringify(before)}`);
  console.log(`Rows after:  ${JSON.stringify(await counts())}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
