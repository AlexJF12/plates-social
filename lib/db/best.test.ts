import { type Kysely, sql } from "kysely";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { latestStartedMonth } from "../cook/best";
import { COLLECTIONS } from "../config";
import { getDb } from ".";
import { getAuthorBadges, getBestCooks, getBestOfMonth, getCookDetail, getCookFeed } from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

// Winner query (Phase 6.6) against the local Postgres, in rolled-back
// transactions. Test months are in 2020 so the human's real cooks never
// compete.

type Db = Kysely<DatabaseSchema>;

const did = (name: string) => `did:plc:testbest${name.padEnd(16, "0")}`;
const [A, B, C, D, E] = ["a", "b", "c", "d", "e"].map(did);
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

afterAll(() => getDb().destroy());
afterEach(() => vi.unstubAllEnvs());

let n = 0;
const rkey = () => `3mwbest${String(n++).padStart(6, "0")}`;

async function accounts(db: Db, ...dids: string[]) {
  await db.insertInto("account").values(dids.map((d) => ({ did: d, handle: `${d.slice(-20)}.test` }))).execute();
}

// A cook at a local wall time with an offset, e.g. "2020-03-31T23:30:00-05:00".
async function cook(db: Db, author: string, cookedAt: string, mealType = "dinner") {
  const uri = `at://${author}/${COLLECTIONS.cook}/${rkey()}`;
  const at = new Date(cookedAt);
  await db
    .insertInto("cook")
    .values({
      uri,
      cid: CID,
      authorDid: author,
      dishName: "Dish",
      mealType,
      images: JSON.stringify([{ cid: CID, mime: "image/jpeg", alt: null, aspectRatio: { width: 1, height: 1 } }]),
      cookedAt,
      cookedAtUtc: at,
      cookedLocalDate: cookedAt.slice(0, 10),
      createdAt: at,
      indexedAt: at,
      sortAt: at,
    })
    .execute();
  return uri;
}

async function kudos(db: Db, subjectUri: string, ...authors: string[]) {
  for (const author of authors) {
    await db
      .insertInto("kudos")
      .values({ uri: `at://${author}/${COLLECTIONS.kudos}/${rkey()}`, authorDid: author, subjectUri, subjectCid: CID, createdAt: new Date() })
      .execute();
  }
}

const winners = async (db: Db, months: string[]) =>
  (await getBestCooks({ months, db })).map((w) => [w.month, w.mealType, w.uri, w.score]);

describe("getBestCooks", () => {
  it("picks the most kudos per month and meal type; a cook needs at least 1", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C, D);
      const one = await cook(db, A, "2020-03-10T19:00:00Z");
      const two = await cook(db, B, "2020-03-11T19:00:00Z");
      await cook(db, C, "2020-03-12T19:00:00Z"); // no kudos: never wins
      const lunch = await cook(db, C, "2020-03-12T12:00:00Z", "lunch");
      await cook(db, A, "2020-03-12T08:00:00Z", "breakfast"); // alone, but 0 kudos
      await kudos(db, one, B);
      await kudos(db, two, A, C);
      await kudos(db, lunch, D);
      expect(await winners(db, ["2020-03"])).toEqual([
        ["2020-03", "dinner", two, 2],
        ["2020-03", "lunch", lunch, 1],
      ]);
    });
  });

  it("breaks ties by earliest cookedAt (as an instant), then lowest uri", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      // 20:00-05:00 is 01:00Z the next day: later than 23:00Z despite the wall time.
      const lateWall = await cook(db, A, "2020-03-10T20:00:00-05:00");
      const early = await cook(db, B, "2020-03-10T23:00:00Z");
      await kudos(db, lateWall, C);
      await kudos(db, early, C);
      expect((await winners(db, ["2020-03"]))[0][2]).toBe(early);

      // Same instant: lowest uri wins.
      const x = await cook(db, A, "2020-04-01T10:00:00Z");
      const y = await cook(db, B, "2020-04-01T10:00:00Z");
      await kudos(db, x, C);
      await kudos(db, y, C);
      expect((await winners(db, ["2020-04"]))[0][2]).toBe([x, y].sort()[0]);
    });
  });

  it("buckets by the author's local month (cookedLocalDate), not UTC", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C);
      // 2020-03-31 23:30 in New York is April 1 in UTC: a March cook.
      const march = await cook(db, A, "2020-03-31T23:30:00-05:00");
      // 2020-04-01 00:30 in Tokyo is still March 31 in UTC: an April cook.
      const april = await cook(db, B, "2020-04-01T00:30:00+09:00");
      await kudos(db, march, C);
      await kudos(db, april, C);
      expect(await winners(db, ["2020-03", "2020-04"])).toEqual([
        ["2020-04", "dinner", april, 1],
        ["2020-03", "dinner", march, 1],
      ]);
      expect(await winners(db, ["2020-03"])).toEqual([["2020-03", "dinner", march, 1]]);
    });
  });

  it("excludes unknown meal types (Other)", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const other = await cook(db, A, "2020-03-10T19:00:00Z", "bake");
      await kudos(db, other, B);
      expect(await winners(db, ["2020-03"])).toEqual([]);
    });
  });

  it("doesn't count self-kudos; one kudos per author (the index keeps one per author and cook)", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C, D);
      const selfish = await cook(db, A, "2020-03-10T19:00:00Z");
      const honest = await cook(db, B, "2020-03-11T19:00:00Z");
      await kudos(db, selfish, A, C); // 1 counted
      await kudos(db, honest, C); // 1 counted, later: loses the tie
      expect(await winners(db, ["2020-03"])).toEqual([["2020-03", "dinner", selfish, 1]]);
      // A duplicate kudos from C can't be indexed: kudos_author_subject_unique.
      // (Last statement: a failed insert aborts the test transaction.)
      await expect(
        sql`insert into kudos (uri, "authorDid", "subjectUri", "subjectCid", "createdAt")
            values (${`at://${C}/${COLLECTIONS.kudos}/dup`}, ${C}, ${selfish}, ${CID}, now())`.execute(db),
      ).rejects.toThrow(/kudos_author_subject_unique/);
    });
  });

  it("ignores kudos from hidden accounts, and hidden cooks don't compete", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C, D, E);
      const a = await cook(db, A, "2020-03-10T19:00:00Z");
      const b = await cook(db, B, "2020-03-11T19:00:00Z");
      await kudos(db, a, C, D);
      await kudos(db, b, E);
      expect((await winners(db, ["2020-03"]))[0][2]).toBe(a);

      // C inactive, D denylisted: a has 0 counted kudos, b wins.
      await db.updateTable("account").set({ active: false }).where("did", "=", C).execute();
      vi.stubEnv("DENYLIST_DIDS", D);
      expect(await winners(db, ["2020-03"])).toEqual([["2020-03", "dinner", b, 1]]);

      // b's author denylisted: nobody wins.
      vi.stubEnv("DENYLIST_DIDS", `${D} ${B}`);
      expect(await winners(db, ["2020-03"])).toEqual([]);

      // A back with C visible again, B still hidden: a wins.
      await db.updateTable("account").set({ active: true }).where("did", "=", C).execute();
      expect(await winners(db, ["2020-03"])).toEqual([["2020-03", "dinner", a, 1]]);
    });
  });

  it("filters to one author's wins after competing against everyone", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B, C, D);
      const a = await cook(db, A, "2020-03-10T19:00:00Z");
      const b = await cook(db, B, "2020-03-11T19:00:00Z");
      await kudos(db, a, C);
      await kudos(db, b, C, D);
      expect(await getBestCooks({ months: ["2020-03"], authorDid: A, db })).toEqual([]);
      expect((await getBestCooks({ months: ["2020-03"], authorDid: B, db })).map((w) => w.uri)).toEqual([b]);
    });
  });
});

describe("badges", () => {
  it("show on feed cards and detail for completed months only", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const past = await cook(db, A, "2020-03-10T19:00:00Z");
      // A month that's still current somewhere (UTC+14): no badge yet.
      const current = await cook(db, A, `${latestStartedMonth()}-01T00:30:00+14:00`);
      await kudos(db, past, B);
      await kudos(db, current, B);

      const feed = (await getCookFeed({ authorDid: A, db })).items;
      expect(feed.find((c) => c.uri === past)?.badge).toEqual({ mealType: "dinner", month: "2020-03" });
      expect(feed.find((c) => c.uri === current)?.badge).toBeNull();
      const detail = await getCookDetail(A, past.split("/").pop()!, db);
      expect(detail?.cook.badge).toEqual({ mealType: "dinner", month: "2020-03" });

      // The current month still has a leader on the Best tab.
      const best = await getBestOfMonth(latestStartedMonth(), db);
      expect(best.find((b) => b.mealType === "dinner")?.cook?.uri).toBe(current);
    });
  });

  it("list a profile's wins newest first, completed months only", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const march = await cook(db, A, "2020-03-10T19:00:00Z");
      const aprilLunch = await cook(db, A, "2020-04-02T12:00:00Z", "lunch");
      const aprilDinner = await cook(db, A, "2020-04-02T19:00:00Z");
      await kudos(db, march, B);
      await kudos(db, aprilLunch, B);
      await kudos(db, aprilDinner, B);
      expect(await getAuthorBadges(A, db)).toEqual([
        { uri: aprilLunch, mealType: "lunch", month: "2020-04" },
        { uri: aprilDinner, mealType: "dinner", month: "2020-04" },
        { uri: march, mealType: "dinner", month: "2020-03" },
      ]);
      // Seen from inside April 2020 (UTC−12 not yet past it), April isn't done.
      const midApril = new Date("2020-05-01T11:00:00Z");
      expect((await getAuthorBadges(A, db, midApril)).map((w) => w.month)).toEqual(["2020-03"]);
    });
  });

  it("the Best tab lists every known meal type in log order, with or without a winner", async () => {
    await inRollback(async (db) => {
      await accounts(db, A, B);
      const snack = await cook(db, A, "2020-03-10T15:00:00Z", "snack");
      await kudos(db, snack, B);
      const best = await getBestOfMonth("2020-03", db);
      expect(best.map((b) => [b.mealType, b.cook?.uri ?? null, b.score])).toEqual([
        ["breakfast", null, 0],
        ["lunch", null, 0],
        ["dinner", null, 0],
        ["snack", snack, 1],
        ["bread", null, 0],
        ["dessert", null, 0],
      ]);
    });
  });
});
