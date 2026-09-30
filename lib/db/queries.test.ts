import type { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from ".";
import { getAccount, getCookDetail, getCookFeed, PAGE_SIZE } from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

const ALICE = "did:plc:testalice00000000000000a";
const BOB = "did:plc:testbob000000000000000b";
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

afterAll(() => getDb().destroy());

// Zero-padded so rkeys sort in index order (the query doesn't need real TIDs).
const rkey = (i: number) => `3mw${String(i).padStart(10, "0")}`;
const cookUri = (did: string, i: number) => `at://${did}/${COLLECTIONS.cook}/${rkey(i)}`;

async function seed(db: Kysely<DatabaseSchema>, did: string, n: number, sortAt: (i: number) => Date) {
  await db.insertInto("account").values({ did, handle: did === ALICE ? "alice.test" : "bob.test" }).execute();
  for (let i = 0; i < n; i++) {
    const at = sortAt(i);
    await db
      .insertInto("cook")
      .values({
        uri: cookUri(did, i),
        cid: CID,
        authorDid: did,
        dishName: `Dish ${i}`,
        mealType: "dinner",
        images: JSON.stringify([{ cid: CID, mime: "image/jpeg", alt: null, aspectRatio: { width: 1, height: 1 } }]),
        cookedAt: at.toISOString(),
        cookedAtUtc: at,
        cookedLocalDate: at.toISOString().slice(0, 10),
        createdAt: at,
        indexedAt: at,
        sortAt: at,
      })
      .execute();
  }
}

async function allPages(db: Kysely<DatabaseSchema>, authorDid?: string) {
  const pages = [];
  let cursor: string | null = null;
  do {
    const page = await getCookFeed({ db, authorDid, cursor });
    pages.push(page.items.filter((c) => [ALICE, BOB].includes(c.author.did)).map((c) => c.uri));
    cursor = page.cursor;
  } while (cursor);
  return pages;
}

describe("getCookFeed", () => {
  it("pages 20 at a time, newest first, with no gaps or repeats, even when sortAt ties", async () => {
    await inRollback(async (db) => {
      // Pairs of cooks share a sortAt, so the uri tie-breaker matters.
      const base = Date.parse("2020-01-01T00:00:00Z");
      await seed(db, ALICE, 45, (i) => new Date(base + Math.floor(i / 2) * 60_000));
      const pages = await allPages(db, ALICE);
      expect(pages.map((p) => p.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 5]);
      const expected = Array.from({ length: 45 }, (_, i) => cookUri(ALICE, 44 - i));
      expect(pages.flat()).toEqual(expected);
    });
  });

  it("hides inactive accounts, and their kudos and comments from counts", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 1, () => new Date("2020-01-01T00:00:00Z"));
      await seed(db, BOB, 1, () => new Date("2020-01-01T00:00:00Z"));
      const subjectUri = cookUri(ALICE, 0);
      await db
        .insertInto("kudos")
        .values({ uri: `at://${BOB}/${COLLECTIONS.kudos}/${rkey(0)}`, authorDid: BOB, subjectUri, subjectCid: CID, createdAt: new Date() })
        .execute();
      await db
        .insertInto("comment")
        .values({ uri: `at://${BOB}/${COLLECTIONS.comment}/${rkey(0)}`, authorDid: BOB, subjectUri, text: "Nice", createdAt: new Date(), sortAt: new Date() })
        .execute();

      let alice = (await getCookFeed({ db, authorDid: ALICE })).items[0];
      expect([alice.kudosCount, alice.commentCount]).toEqual([1, 1]);
      expect((await getCookDetail(ALICE, rkey(0), db))?.comments).toHaveLength(1);

      await db.updateTable("account").set({ active: false }).where("did", "=", BOB).execute();
      alice = (await getCookFeed({ db, authorDid: ALICE })).items[0];
      expect([alice.kudosCount, alice.commentCount]).toEqual([0, 0]);
      expect((await getCookFeed({ db, authorDid: BOB })).items).toEqual([]);
      const detail = await getCookDetail(ALICE, rkey(0), db);
      expect([detail?.kudos, detail?.comments]).toEqual([[], []]);
      expect(await getCookDetail(BOB, rkey(0), db)).toBeNull();
    });
  });

  it("ignores a malformed cursor", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 1, () => new Date("2020-01-01T00:00:00Z"));
      expect((await getCookFeed({ db, authorDid: ALICE, cursor: "garbage" })).items).toHaveLength(1);
    });
  });
});

describe("getAccount", () => {
  it("finds by DID or handle (any case), not by junk", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 0, () => new Date());
      expect((await getAccount(ALICE, db))?.handle).toBe("alice.test");
      expect((await getAccount("Alice.Test", db))?.did).toBe(ALICE);
      expect(await getAccount("not a handle", db)).toBeNull();
    });
  });
});
