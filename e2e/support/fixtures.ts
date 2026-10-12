import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import sharp from "sharp";

// Local-only fixture rows for the signed-in e2e suite (Phase 6.7). Created
// by global-setup straight into the local Postgres, removed by
// global-teardown. Every DID starts with did:plc:e2e and every record URI
// contains the rkey prefix 3mwe2e, so cleanup can't touch real rows.
// Photos and avatars are emoji-on-a-plate images written into the image
// proxy's disk cache under their CIDs (nothing is uploaded anywhere).

export const DID_PREFIX = "did:plc:e2e";
export const RKEY_PREFIX = "3mwe2e";
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy"; // record cid (unused by the UI)

export const VIEWER = { did: "did:plc:e2eviewer000000000000", handle: "vera.e2e.test", name: "Vera Viewer" };
export const LONELY = { did: "did:plc:e2elonely000000000000", handle: "lou.e2e.test", name: "Lou Lonely" };
export const MIRA = { did: "did:plc:e2emira00000000000000", handle: "mira.e2e.test", name: "Mira Adeyemi" };
export const TOMAS = { did: "did:plc:e2etomas0000000000000", handle: "tomas.e2e.test", name: "Tomás Reyes" };
export const KAI = { did: "did:plc:e2ekai000000000000000", handle: "kai.e2e.test", name: "Kai Nakamura" };

// The completed month the Best tests look at, and the earliest fixture month.
export const BEST_MONTH = "2025-06";
export const EARLIEST_MONTH = "2025-05";
export const MIRA_COOKS = 24;

export const cookUri = (did: string, rkey: string) => `at://${did}/com.example.cooklog.cook/${rkey}`;
export const rk = (name: string) => `${RKEY_PREFIX}${name}`;

export function loadEnv() {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    try {
      process.loadEnvFile(".env.local");
    } catch {}
  }
  return { databaseUrl: process.env.DATABASE_URL, secret: process.env.SESSION_SECRET };
}

// The signed session cookie (lib/auth/cookie.ts) for a fixture DID. Minted
// in the test process only.
export function sessionCookie(did: string) {
  const { secret } = loadEnv();
  return `${did}.${createHmac("sha256", secret!).update(did).digest("base64url")}`;
}

const cacheDir = () => process.env.IMAGE_CACHE_DIR || path.join(process.cwd(), ".cache", "img");

// CIDv1, raw codec, sha256, base32: what a PDS gives a blob.
function cidFor(bytes: Buffer) {
  const buf = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), createHash("sha256").update(bytes).digest()]);
  const A = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let val = 0;
  let out = "";
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += A[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return `b${out}`;
}

// The same renders lib/image/proxy.ts makes, where it looks first.
const SIZES = {
  avatar: { width: 128, height: 128, fit: "cover" },
  thumb: { width: 1080, height: 2700, fit: "inside" },
  full: { width: 2000, height: 2000, fit: "inside" },
} as const;
async function cacheImage(bytes: Buffer, sizes: (keyof typeof SIZES)[]) {
  const cid = cidFor(bytes);
  mkdirSync(cacheDir(), { recursive: true });
  for (const s of sizes) {
    const { width, height, fit } = SIZES[s];
    const out = await sharp(bytes)
      .resize({ width, height, fit, withoutEnlargement: true })
      .webp({ quality: s === "full" ? 85 : 80 })
      .toBuffer();
    writeFileSync(path.join(cacheDir(), `${cid}-${s}.webp`), out);
  }
  return cid;
}

type Img = { cid: string; width: number; height: number };

type CookSpec = { author: string; rkey: string; dish: string; meal: string; cookedAt: string; img: Img; note?: string };

// Fixture images, rendered once per run with Chromium (it has a color
// emoji font; sharp's SVG renderer doesn't).
async function renderImages() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function shot(emoji: string, bg: string, w: number, h: number, avatar = false) {
    await page.setViewportSize({ width: w, height: h });
    const size = Math.round(Math.min(w, h) * (avatar ? 0.62 : 0.42));
    const plate = avatar
      ? ""
      : `<div style="position:absolute;width:${size * 1.7}px;height:${size * 1.7}px;border-radius:50%;background:#fffdf8;box-shadow:0 ${size * 0.06}px ${size * 0.2}px rgba(60,40,20,.18)"></div>`;
    await page.setContent(
      `<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;background:${bg};position:relative;overflow:hidden">${plate}<div style="position:relative;font-size:${size}px;line-height:1">${emoji}</div></body>`,
    );
    return sharp(await page.screenshot({ type: "png" })).jpeg({ quality: 85 }).toBuffer();
  }
  const dish = async (emoji: string, bg: string, w: number, h: number): Promise<Img> => ({
    cid: await cacheImage(await shot(emoji, bg, w, h), ["thumb", "full"]),
    width: w,
    height: h,
  });
  const avatar = async (emoji: string, bg: string) => cacheImage(await shot(emoji, bg, 400, 400, true), ["avatar"]);

  const images = {
    ribs: await dish("🍖", "#f1dcc0", 1200, 1500),
    galette: await dish("🥧", "#f3e1a8", 1600, 1200),
    salad: await dish("🥗", "#d9e7d0", 1400, 1400),
    soup: await dish("🍲", "#cfe0ee", 1200, 1500),
    tacos: await dish("🌮", "#f6d7c3", 1600, 1200),
    congee: await dish("🍚", "#e0e4f6", 1400, 1400),
    tart: await dish("🍋", "#f5ecb8", 1200, 1500),
    toast: await dish("🍞", "#eadfcf", 1600, 1200),
    dal: await dish("🍛", "#f2cfd6", 1400, 1400),
  };
  const avatars = {
    viewer: await avatar("👩🏼‍🍳", "#d4ecea"),
    mira: await avatar("👩🏾", "#f5d5c8"),
    tomas: await avatar("👨🏽", "#e8d6ef"),
    kai: await avatar("🧑🏻", "#dbe9dc"),
  };
  // A photo for the log form test.
  const photoPath = path.join(os.tmpdir(), "cooklog-e2e-photo.jpg");
  writeFileSync(photoPath, await shot("🥘", "#f1dcc0", 1600, 1200));
  await browser.close();
  return { images, avatars, photoPath };
}

export async function createFixtures(pool: Pool) {
  await removeFixtures(pool);
  const { images, avatars, photoPath } = await renderImages();

  const accounts = [
    [VIEWER, avatars.viewer],
    [LONELY, null],
    [MIRA, avatars.mira],
    [TOMAS, avatars.tomas],
    [KAI, avatars.kai],
  ] as const;
  for (const [a, avatarCid] of accounts) {
    await pool.query(`insert into account (did, handle, "displayName", "avatarCid") values ($1, $2, $3, $4)`, [
      a.did,
      a.handle,
      a.name,
      avatarCid,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  const miraDishes = [
    ["Tomato galette", "lunch", images.galette],
    ["Green salad", "lunch", images.salad],
    ["Chicken soup", "dinner", images.soup],
  ] as const;
  const cooks: CookSpec[] = [
    // In BEST_MONTH: Mira's ribs win dinner (2 kudos), Tomás's congee wins breakfast.
    { author: MIRA.did, rkey: rk("ribs"), dish: "Braised short ribs", meal: "dinner", cookedAt: "2025-06-14T19:30:00-04:00", img: images.ribs, note: "Low and slow, four hours." },
    { author: TOMAS.did, rkey: rk("tacos"), dish: "Fish tacos", meal: "dinner", cookedAt: "2025-06-10T20:00:00-07:00", img: images.tacos },
    { author: TOMAS.did, rkey: rk("congee"), dish: "Ginger congee", meal: "breakfast", cookedAt: "2025-06-11T08:00:00-07:00", img: images.congee },
    { author: TOMAS.did, rkey: rk("tart"), dish: "Lemon tart", meal: "dessert", cookedAt: "2025-06-12T21:00:00-07:00", img: images.tart },
    { author: KAI.did, rkey: rk("miso"), dish: "Miso soup", meal: "lunch", cookedAt: "2025-06-15T12:00:00+09:00", img: images.soup },
    { author: VIEWER.did, rkey: rk("dal"), dish: "Weeknight dal", meal: "dinner", cookedAt: "2025-06-20T19:00:00Z", img: images.dal },
    // Today (UTC; signed-in tests run in UTC), for the profile stats.
    { author: VIEWER.did, rkey: rk("toast"), dish: "Sourdough toast", meal: "breakfast", cookedAt: `${today}T00:05:00Z`, img: images.toast },
  ];
  // Mira's paging set: MIRA_COOKS - 1 more, in May 2025.
  for (let i = 1; i < MIRA_COOKS; i++) {
    const [dish, meal, img] = miraDishes[i % miraDishes.length];
    const day = String(1 + (i % 28)).padStart(2, "0");
    cooks.push({ author: MIRA.did, rkey: rk(`m${String(i).padStart(3, "0")}`), dish: `${dish} no. ${i}`, meal, cookedAt: `2025-05-${day}T${String(8 + (i % 12)).padStart(2, "0")}:00:00Z`, img });
  }
  for (const c of cooks) await insertCook(pool, c);

  const kudos: [string, string, string][] = [
    [TOMAS.did, MIRA.did, rk("ribs")],
    [KAI.did, MIRA.did, rk("ribs")],
    [KAI.did, TOMAS.did, rk("congee")],
    [VIEWER.did, TOMAS.did, rk("tacos")],
    [MIRA.did, VIEWER.did, rk("dal")],
  ];
  for (const [i, [author, did, rkey]] of kudos.entries()) {
    await pool.query(
      `insert into kudos (uri, "authorDid", "subjectUri", "subjectCid", "createdAt") values ($1, $2, $3, $4, now())`,
      [`at://${author}/com.example.cooklog.kudos/${rk(`k${i}`)}`, author, cookUri(did, rkey), CID],
    );
  }
  const comments: [string, string][] = [
    [TOMAS.did, "Looks amazing!"],
    [VIEWER.did, "Recipe please?"],
  ];
  for (const [i, [author, text]] of comments.entries()) {
    const at = new Date(Date.UTC(2025, 5, 15, 10, i));
    await pool.query(
      `insert into comment (uri, "authorDid", "subjectUri", text, "createdAt", "sortAt") values ($1, $2, $3, $4, $5, $5)`,
      [`at://${author}/com.example.cooklog.comment/${rk(`c${i}`)}`, author, cookUri(MIRA.did, rk("ribs")), text, at],
    );
  }
  await pool.query(`insert into follow (uri, "authorDid", "subjectDid", "createdAt") values ($1, $2, $3, now())`, [
    `at://${VIEWER.did}/com.example.cooklog.follow/${rk("f0")}`,
    VIEWER.did,
    MIRA.did,
  ]);
  return { photoPath, image: images.galette };
}

// A cached fixture photo, for cooks a test inserts (set by global-setup).
export const fixtureImage = (): Img => JSON.parse(process.env.E2E_IMAGE!);

// Also used by tests (e.g. a new cook appearing on pull to refresh).
export async function insertCook(pool: Pool, c: CookSpec, sortAt?: Date) {
  const at = new Date(c.cookedAt);
  await pool.query(
    `insert into cook (uri, cid, "authorDid", "dishName", "mealType", note, images, "cookedAt", "cookedAtUtc", "cookedLocalDate", "createdAt", "indexedAt", "sortAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9, $9, $11)`,
    [
      cookUri(c.author, c.rkey),
      CID,
      c.author,
      c.dish,
      c.meal,
      c.note ?? null,
      JSON.stringify([{ cid: c.img.cid, mime: "image/jpeg", alt: `${c.dish} (illustration)`, aspectRatio: { width: c.img.width, height: c.img.height } }]),
      c.cookedAt,
      at,
      c.cookedAt.slice(0, 10),
      sortAt ?? at,
    ],
  );
}

// Every fixture row, and the cached images only fixtures use. Safe to run
// any time (setup runs it first, in case an earlier run was killed).
export async function removeFixtures(pool: Pool) {
  const { rows } = await pool.query<{ cid: string }>(
    `select "avatarCid" as cid from account where did like $1 and "avatarCid" is not null
     union select i->>'cid' from cook, jsonb_array_elements(images) i where "authorDid" like $1
     except (select "avatarCid" from account where did not like $1 and "avatarCid" is not null
             union select i->>'cid' from cook, jsonb_array_elements(images) i where "authorDid" not like $1)`,
    [`${DID_PREFIX}%`],
  );
  const like = `${DID_PREFIX}%`;
  const marker = `%/${RKEY_PREFIX}%`;
  await pool.query(`delete from kudos where uri like $2 or "authorDid" like $1 or "subjectUri" like 'at://' || $1`, [like, marker]);
  await pool.query(`delete from comment where uri like $2 or "authorDid" like $1 or "subjectUri" like 'at://' || $1`, [like, marker]);
  await pool.query(`delete from follow where uri like $2 or "authorDid" like $1 or "subjectDid" like $1`, [like, marker]);
  await pool.query(`delete from cook where uri like $2 or "authorDid" like $1`, [like, marker]);
  await pool.query(`delete from login where did like $1`, [like]);
  await pool.query(`delete from account where did like $1`, [like]);
  const dir = cacheDir();
  if (existsSync(dir)) {
    const cids = new Set(rows.map((r) => r.cid));
    for (const f of readdirSync(dir)) if (cids.has(f.split("-")[0])) rmSync(path.join(dir, f));
  }
}
