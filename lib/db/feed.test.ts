import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../config";
import { countStats } from "../cook/stats";
import { getDb } from ".";
import {
  type FeedItem,
  PAGE_SIZE,
  getAuthorBadges,
  getBestOfMonth,
  getComments,
  getCookDayCounts,
  getFeed,
  getVisiblePost,
  getVisitDayCounts,
  getVisitDetail,
  searchPosts,
} from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

// The mixed feed of cooks and visits (Phase 6.8) against the local
// Postgres, in rolled-back transactions. Assertions only look at the test
// DIDs below.

type Db = Kysely<DatabaseSchema>;

const A = "did:plc:testfeeda0000000000000a";
const B = "did:plc:testfeedb0000000000000b";
const C = "did:plc:testfeedc0000000000000c";
const DIDS = [A, B, C];
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const IMAGES = JSON.stringify([{ cid: CID, mime: "image/jpeg", alt: null, aspectRatio: { width: 1, height: 1 } }]);

afterAll(() => getDb().destroy());
afterEach(() => vi.unstubAllEnvs());

const rkey = (i: number) => `3mwfeed${String(i).padStart(6, "0")}`;
const cookUri = (did: string, i: number) => `at://${did}/${COLLECTIONS.cook}/${rkey(i)}`;
const visitUri = (did: string, i: number) => `at://${did}/${COLLECTIONS.visit}/${rkey(i)}`;
const T0 = Date.UTC(2020, 0, 1);
const minute = (n: number) => new Date(T0 + n * 60_000);

async function accounts(db: Db, ...dids: string[]) {
  await db.insertInto("account").values(dids.map((did) => ({ did, handle: `${did.slice(-10)}.test` }))).execute();
}

async function cook(db: Db, did: string, i: number, opts: { sortAt?: Date; dish?: string; meal?: string; cookedAt?: string } = {}) {
  const sortAt = opts.sortAt ?? minute(i);
  const cookedAt = opts.cookedAt ?? sortAt.toISOString();
  await db
    .insertInto("cook")
    .values({
      uri: cookUri(did, i),
      cid: CID,
      authorDid: did,
      dishName: opts.dish ?? `zqfeed dish ${i}`,
      mealType: opts.meal ?? "dinner",
      images: IMAGES,
      cookedAt,
      cookedAtUtc: new Date(cookedAt),
      cookedLocalDate: cookedAt.slice(0, 10),
      createdAt: sortAt,
      indexedAt: sortAt,
      sortAt,
    })
    .execute();
  return cookUri(did, i);
}

async function visit(
  db: Db,
  did: string,
  i: number,
  opts: { sortAt?: Date; name?: string; area?: string | null; meal?: string; visitedAt?: string; rating?: number } = {},
) {
  const sortAt = opts.sortAt ?? minute(i);
  const visitedAt = opts.visitedAt ?? sortAt.toISOString();
  await db
    .insertInto("visit")
    .values({
      uri: visitUri(did, i),
      cid: CID,
      authorDid: did,
      restaurantName: opts.name ?? `zqfeed place ${i}`,
      restaurantArea: opts.area === undefined ? "Brooklyn" : opts.area,
      rating: opts.rating ?? 4,
      review: "Good",
      mealType: opts.meal ?? "dinner",
      images: IMAGES,
      visitedAt,
      visitedAtUtc: new Date(visitedAt),
      visitedLocalDate: visitedAt.slice(0, 10),
      createdAt: sortAt,
      indexedAt: sortAt,
      sortAt,
    })
    .execute();
  return visitUri(did, i);
}

let n = 0;
const kudos = (db: Db, author: string, subjectUri: string) =>
  db
    .insertInto("kudos")
    .values({ uri: `at://${author}/${COLLECTIONS.kudos}/${rkey(900 + n++)}`, authorDid: author, subjectUri, subjectCid: CID, createdAt: new Date() })
    .execute();
const comment = (db: Db, author: string, subjectUri: string) =>
  db
    .insertInto("comment")
    .values({
      uri: `at://${author}/${COLLECTIONS.comment}/${rkey(900 + n++)}`,
      authorDid: author,
      subjectUri,
      text: "Nice",
      createdAt: new Date(),
      sortAt: new Date(),
    })
    .execute();
const follow = (db: Db, author: string, subjectDid: string) =>
  db
    .insertInto("follow")
    .values({ uri: `at://${author}/${COLLECTIONS.follow}/${rkey(900 + n++)}`, authorDid: author, subjectDid, createdAt: new Date() })
    .execute();

const mine = (items: FeedItem[]) => items.filter((i) => DIDS.includes(i.author.did));
const uris = (items: FeedItem[]) => mine(items).map((i) => i.uri);

async function allPages(db: Db, opts: Parameters<typeof getFeed>[0] = {}) {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page = await getFeed({ ...opts, db, cursor });
    pages.push(uris(page.items));
    cursor = page.cursor;
  } while (cursor);
  return pages;
}

describe("getFeed: cooks and visits in one list", () => {
  it("pages 20 at a time across both kinds, newest first, with no gaps or repeats when sortAt ties", async () => {
    await inRollback(async (db) => {
      await accounts(db, A);
      // A cook and a visit share each minute (and so tie on sortAt), plus a
      // few cooks alone: 23 visits + 22 cooks = 45 posts.
      const expected: string[] = [];
      for (let i = 0; i < 23; i++) {
        expected.push(await visit(db, A, i, { sortAt: minute(i) }));
        if (i < 22) expected.push(await cook(db, A, i, { sortAt: minute(i) }));
      }
      const order = (u: string) => [expected.indexOf(u) >> 1, u] as const;
      expected.sort((x, y) => {
        const [mx, ux] = order(x);
        const [my, uy] = order(y);
        return my - mx || (uy < ux ? -1 : uy > ux ? 1 : 0);
      });
      const pages = await allPages(db, { authorDid: A });
      expect(pages.map((p) => p.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 5]);
      expect(pages.flat()).toEqual(expected);
      expect(new Set(pages.flat()).size).toBe(45);
    });
  });

  it("returns each kind with its own fields", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const c = await cook(db, A, 1);
      const v = await visit(db, A, 2, { name: "Lilia", area: "Brooklyn", rating: 5, visitedAt: "2020-01-01T21:30:00-05:00" });
      await kudos(db, B, v);
      await comment(db, B, v);
      const items = mine((await getFeed({ authorDid: A, viewer: B, db })).items);
      expect(items.map((i) => [i.kind, i.uri])).toEqual([["visit", v], ["cook", c]]);
      const [vi] = items;
      expect(vi).toMatchObject({
        kind: "visit",
        rkey: rkey(2),
        restaurantName: "Lilia",
        restaurantArea: "Brooklyn",
        rating: 5,
        review: "Good",
        visitedLocalDate: "2020-01-01",
        kudosCount: 1,
        commentCount: 1,
        viewerKudos: true,
      });
      // The date only: the time it was eaten never leaves the server.
      expect(vi).not.toHaveProperty("visitedAt");
      expect(JSON.stringify(vi)).not.toContain("21:30");
      expect(items[1]).toMatchObject({ kind: "cook", dishName: "zqfeed dish 1", badge: null, viewerKudos: false });
    });
  });

  it("Following: own and followed people's cooks and visits; Global: everyone's", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      await follow(db, A, B);
      const own = await visit(db, A, 1);
      const followedCook = await cook(db, B, 2);
      const followedVisit = await visit(db, B, 3);
      const stranger = await visit(db, C, 4);
      expect(uris((await getFeed({ followedBy: A, db })).items)).toEqual([followedVisit, followedCook, own]);
      expect(uris((await getFeed({ db })).items)).toEqual([stranger, followedVisit, followedCook, own]);
      expect(uris((await getFeed({ authorDid: B, db })).items)).toEqual([followedVisit, followedCook]);
    });
  });

  it("hides visits by inactive and denylisted accounts, and their kudos and comments from counts", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      const v = await visit(db, A, 1);
      await visit(db, B, 2);
      await kudos(db, C, v);
      await comment(db, C, v);
      const counts = async () => mine((await getFeed({ authorDid: A, db })).items).map((i) => [i.kudosCount, i.commentCount]);
      expect(await counts()).toEqual([[1, 1]]);

      vi.stubEnv("DENYLIST_DIDS", C);
      expect(await counts()).toEqual([[0, 0]]);
      vi.stubEnv("DENYLIST_DIDS", B);
      expect(uris((await getFeed({ db })).items)).toEqual([v]);
      vi.unstubAllEnvs();

      await db.updateTable("account").set({ active: false }).where("did", "=", A).execute();
      expect(uris((await getFeed({ db })).items)).toEqual([visitUri(B, 2)]);
    });
  });

  it("viewerKudos on visits: true only for the viewer's own kudos", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      const v = await visit(db, A, 1);
      await kudos(db, B, v);
      const flag = async (viewer: string | null) => mine((await getFeed({ authorDid: A, viewer, db })).items)[0].viewerKudos;
      expect([await flag(B), await flag(C), await flag(null)]).toEqual([true, false, false]);
    });
  });

  it("a page is a fixed number of queries, never one per card", async () => {
    // Its own connection with query logging, in a rolled-back transaction.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    let count = 0;
    const logged = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool }),
      log: (e) => {
        if (e.level === "query") count++;
      },
    });
    const queriesFor = async (db: Db, opts: Parameters<typeof getFeed>[0]) => {
      count = 0;
      await getFeed({ ...opts, db });
      return count;
    };
    try {
      await logged
        .transaction()
        .execute(async (trx) => {
          await accounts(trx, A, B);
          await cook(trx, A, 0);
          await visit(trx, A, 1);
          const two = await queriesFor(trx, { authorDid: A, viewer: B });
          for (let i = 2; i < 2 + PAGE_SIZE + 5; i++) {
            await (i % 2 ? visit(trx, A, i) : cook(trx, A, i));
            await kudos(trx, B, i % 2 ? visitUri(A, i) : cookUri(A, i));
          }
          const full = await queriesFor(trx, { authorDid: A, viewer: B });
          // The union, the page's cooks, its visits, and the cooks' badges.
          expect(two).toBe(4);
          expect(full).toBe(two);
          throw new Error("rollback");
        })
        .catch((err) => {
          if (err.message !== "rollback") throw err;
        });
    } finally {
      await logged.destroy();
    }
  });
});

describe("getVisitDetail and visit subjects", () => {
  it("has the visit, its kudos and comments, and viewerKudos", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      const v = await visit(db, A, 1, { name: "Lilia" });
      await kudos(db, B, v);
      await comment(db, C, v);
      const d = await getVisitDetail(A, rkey(1), db, B);
      expect(d?.visit).toMatchObject({ uri: v, restaurantName: "Lilia", viewerKudos: true, kudosCount: 1, commentCount: 1 });
      expect(d?.kudos.map((k) => k.did)).toEqual([B]);
      expect(d?.comments.items.map((c) => c.author.did)).toEqual([C]);
      expect(await getVisitDetail(A, rkey(2), db)).toBeNull();
      expect(await getVisiblePost(v, db)).toEqual({ uri: v, cid: CID, authorDid: A, kind: "visit" });
    });
  });

  it("hides kudos and comments on a deleted or hidden visit, but keeps their rows", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const v = await visit(db, A, 1);
      await kudos(db, B, v);
      await comment(db, B, v);
      await db.updateTable("account").set({ active: false }).where("did", "=", A).execute();
      expect(await getVisitDetail(A, rkey(1), db)).toBeNull();
      expect(await getVisiblePost(v, db)).toBeNull();
      expect((await getComments({ cookUri: v, db })).items).toEqual([]);

      await db.updateTable("account").set({ active: true }).where("did", "=", A).execute();
      expect((await getComments({ cookUri: v, db })).items).toHaveLength(1);
      await db.deleteFrom("visit").where("uri", "=", v).execute();
      expect((await getComments({ cookUri: v, db })).items).toEqual([]);
      const rows = await db.selectFrom("kudos").select("uri").where("subjectUri", "=", v).execute();
      expect(rows).toHaveLength(1);
    });
  });

  it("getVisiblePost names neither kind for other collections", async () => {
    await inRollback(async (db) => {
      expect(await getVisiblePost(`at://${A}/app.bsky.feed.post/${rkey(1)}`, db)).toBeNull();
      expect(await getVisiblePost("not a uri", db)).toBeNull();
      expect((await getComments({ cookUri: "not a uri", db })).items).toEqual([]);
    });
  });
});

describe("searchPosts across cooks and visits", () => {
  it("matches restaurant names and areas like dish names, in one newest-first list", async () => {
    await inRollback(async (db) => {
      await accounts(db, A);
      const c = await cook(db, A, 1, { dish: "Zqcarbonara di Roma" });
      const byName = await visit(db, A, 2, { name: "Trattoria Zqroma", area: null });
      const byArea = await visit(db, A, 3, { name: "Lilia", area: "Zqróma Heights" });
      await visit(db, A, 4, { name: "Elsewhere", area: "Queens" });
      const found = async (q: string, mealType?: string) => uris((await searchPosts({ q, mealType, db })).items);
      expect(await found("zqroma")).toEqual([byArea, byName]);
      expect(await found("ZQRÓMA")).toEqual([byArea, byName]);
      expect(await found("roma")).toEqual([byArea, byName, c]);
      expect(await found("zqroma heights")).toEqual([byArea]);
    });
  });

  it("the meal filter applies to both kinds; wildcards are literal", async () => {
    await inRollback(async (db) => {
      await accounts(db, A);
      const drinksCook = await cook(db, A, 1, { dish: "zqmeal negroni", meal: "drinks" });
      const drinksVisit = await visit(db, A, 2, { name: "zqmeal bar", meal: "drinks" });
      await visit(db, A, 3, { name: "zqmeal diner", meal: "dinner" });
      expect(uris((await searchPosts({ q: "zqmeal", mealType: "drinks", db })).items)).toEqual([drinksVisit, drinksCook]);
      expect(uris((await searchPosts({ q: "zq%l", db })).items)).toEqual([]);
    });
  });

  it("pages across both kinds with the cursor", async () => {
    await inRollback(async (db) => {
      await accounts(db, A);
      for (let i = 0; i < 25; i++) await (i % 2 ? visit(db, A, i, { name: `zqpage ${i}` }) : cook(db, A, i, { dish: `zqpage ${i}` }));
      const first = await searchPosts({ q: "zqpage", db });
      const second = await searchPosts({ q: "zqpage", cursor: first.cursor, db });
      expect([uris(first.items).length, uris(second.items).length, second.cursor]).toEqual([20, 5, null]);
      expect(new Set([...uris(first.items), ...uris(second.items)]).size).toBe(25);
    });
  });
});

describe("cook stats and Best ignore visits; eating-out counts", () => {
  it("cook day counts and Best don't see visits, even a winning-looking one", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      const v = await visit(db, A, 1, { visitedAt: "2020-03-10T19:00:00Z", meal: "dinner" });
      await kudos(db, B, v);
      await kudos(db, C, v);
      expect(await getCookDayCounts(A, { from: "2020-03-01", to: "2020-03-31" }, db)).toEqual([]);
      const best = await getBestOfMonth("2020-03", db);
      expect(best.every((b) => b.cook === null)).toBe(true);
      expect(await getAuthorBadges(A, db)).toEqual([]);
    });
  });

  it("eating-out counts bucket by the author's local date, across midnight UTC", async () => {
    await inRollback(async (db) => {
      await accounts(db, A);
      // Sunday 8 Mar 23:30 in New York is Monday 9 Mar in UTC: it counts in
      // the week of 2 Mar (the author's Sunday), not the week of 9 Mar.
      await visit(db, A, 1, { visitedAt: "2020-03-08T23:30:00-04:00" });
      // Monday 9 Mar 07:00 in Tokyo is Sunday 8 Mar in UTC: week of 9 Mar.
      await visit(db, A, 2, { visitedAt: "2020-03-09T07:00:00+09:00" });
      await visit(db, A, 3, { visitedAt: "2020-03-11T12:00:00Z" });
      // February: outside March.
      await visit(db, A, 4, { visitedAt: "2020-02-29T23:00:00-05:00" });
      // A cook doesn't count as eating out.
      await cook(db, A, 5, { cookedAt: "2020-03-10T19:00:00Z" });
      const days = await getVisitDayCounts(A, { from: "2020-02-01", to: "2020-03-31" }, db);
      expect(days).toEqual([
        { date: "2020-02-29", count: 1 },
        { date: "2020-03-08", count: 1 },
        { date: "2020-03-09", count: 1 },
        { date: "2020-03-11", count: 1 },
      ]);
      expect(countStats(days, "2020-03-12")).toEqual({ week: 2, month: 3 });
      expect(countStats(days, "2020-03-08")).toEqual({ week: 1, month: 3 });
    });
  });
});
