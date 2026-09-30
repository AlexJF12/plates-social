import type { Kysely } from "kysely";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from ".";
import {
  getAccount,
  getComments,
  getCookDayCounts,
  getCookDetail,
  getCookFeed,
  getFollowUri,
  getImportCandidates,
  getKudosUri,
  getVisibleCook,
  PAGE_SIZE,
} from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

const ALICE = "did:plc:testalice00000000000000a";
const BOB = "did:plc:testbob000000000000000b";
const CAROL = "did:plc:testcarol0000000000000c";
const DAVE = "did:plc:testdave00000000000000d";
const HANDLES: Record<string, string> = { [ALICE]: "alice.test", [BOB]: "bob.test", [CAROL]: "carol.test", [DAVE]: "dave.test" };
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

afterAll(() => getDb().destroy());

// Zero-padded so rkeys sort in index order (the query doesn't need real TIDs).
const rkey = (i: number) => `3mw${String(i).padStart(10, "0")}`;
const cookUri = (did: string, i: number) => `at://${did}/${COLLECTIONS.cook}/${rkey(i)}`;

async function seed(db: Kysely<DatabaseSchema>, did: string, n: number, sortAt: (i: number) => Date) {
  await db.insertInto("account").values({ did, handle: HANDLES[did] }).execute();
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
    pages.push(page.items.filter((c) => c.author.did in HANDLES).map((c) => c.uri));
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
      expect((await getCookDetail(ALICE, rkey(0), db))?.comments.items).toHaveLength(1);

      await db.updateTable("account").set({ active: false }).where("did", "=", BOB).execute();
      alice = (await getCookFeed({ db, authorDid: ALICE })).items[0];
      expect([alice.kudosCount, alice.commentCount]).toEqual([0, 0]);
      expect((await getCookFeed({ db, authorDid: BOB })).items).toEqual([]);
      const detail = await getCookDetail(ALICE, rkey(0), db);
      expect([detail?.kudos, detail?.comments.items]).toEqual([[], []]);
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

async function addFollow(db: Kysely<DatabaseSchema>, author: string, subject: string, i = 0) {
  await db
    .insertInto("follow")
    .values({ uri: `at://${author}/${COLLECTIONS.follow}/${rkey(i)}`, authorDid: author, subjectDid: subject, createdAt: new Date() })
    .execute();
}

describe("following feed", () => {
  it("has your own cooks plus those of people you follow, newest first, and pages", async () => {
    await inRollback(async (db) => {
      const base = Date.parse("2020-01-01T00:00:00Z");
      // Interleaved times across authors; 3 × 15 cooks, only Alice + Bob count.
      await seed(db, ALICE, 15, (i) => new Date(base + (i * 3 + 0) * 60_000));
      await seed(db, BOB, 15, (i) => new Date(base + (i * 3 + 1) * 60_000));
      await seed(db, CAROL, 15, (i) => new Date(base + (i * 3 + 2) * 60_000));
      await addFollow(db, ALICE, BOB);
      // Carol follows Alice; that mustn't put Carol's cooks in Alice's feed.
      await addFollow(db, CAROL, ALICE);

      const first = await getCookFeed({ db, followedBy: ALICE });
      expect(first.cursor).not.toBeNull();
      const second = await getCookFeed({ db, followedBy: ALICE, cursor: first.cursor });
      const uris = [...first.items, ...second.items].map((c) => c.uri);
      const expected = Array.from({ length: 15 }, (_, k) => 14 - k).flatMap((i) => [cookUri(BOB, i), cookUri(ALICE, i)]);
      expect(first.items).toHaveLength(PAGE_SIZE);
      expect(second.cursor).toBeNull();
      expect(uris).toEqual(expected);
    });
  });

  it("drops a followed account's cooks when it's inactive or unfollowed", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 0, () => new Date());
      await seed(db, BOB, 1, () => new Date("2020-01-01T00:00:00Z"));
      await addFollow(db, ALICE, BOB);
      expect((await getCookFeed({ db, followedBy: ALICE })).items).toHaveLength(1);

      await db.updateTable("account").set({ active: false }).where("did", "=", BOB).execute();
      expect((await getCookFeed({ db, followedBy: ALICE })).items).toEqual([]);

      await db.updateTable("account").set({ active: true }).where("did", "=", BOB).execute();
      await db.deleteFrom("follow").where("authorDid", "=", ALICE).execute();
      expect((await getCookFeed({ db, followedBy: ALICE })).items).toEqual([]);
    });
  });
});

describe("getFollowUri", () => {
  it("returns the viewer's follow of that subject only", async () => {
    await inRollback(async (db) => {
      await addFollow(db, ALICE, BOB);
      expect(await getFollowUri(ALICE, BOB, db)).toBe(`at://${ALICE}/${COLLECTIONS.follow}/${rkey(0)}`);
      expect(await getFollowUri(BOB, ALICE, db)).toBeNull();
    });
  });
});

describe("getImportCandidates", () => {
  it("keeps visible accounts with a cook that you don't already follow", async () => {
    await inRollback(async (db) => {
      const at = () => new Date("2020-01-01T00:00:00Z");
      await seed(db, ALICE, 1, at);
      await seed(db, BOB, 1, at); // candidate
      await seed(db, CAROL, 1, at); // already followed
      await seed(db, DAVE, 0, at); // no cooks
      await addFollow(db, ALICE, CAROL);
      const OUTSIDER = "did:plc:testoutsider00000000000e"; // not indexed at all
      const bsky = [ALICE, BOB, CAROL, DAVE, OUTSIDER];

      expect((await getImportCandidates(ALICE, bsky, db)).map((a) => a.did)).toEqual([BOB]);

      await db.updateTable("account").set({ active: false }).where("did", "=", BOB).execute();
      expect(await getImportCandidates(ALICE, bsky, db)).toEqual([]);
      expect(await getImportCandidates(ALICE, [], db)).toEqual([]);
    });
  });
});

async function addComment(db: Kysely<DatabaseSchema>, author: string, subjectUri: string, i: number, sortAt: Date) {
  await db
    .insertInto("comment")
    .values({ uri: `at://${author}/${COLLECTIONS.comment}/${rkey(i)}`, authorDid: author, subjectUri, text: `c${i}`, createdAt: sortAt, sortAt })
    .execute();
}

describe("getComments", () => {
  it("pages 20 at a time, oldest first, with no gaps or repeats, even when sortAt ties", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 1, () => new Date("2020-01-01T00:00:00Z"));
      await seed(db, BOB, 0, () => new Date());
      const subject = cookUri(ALICE, 0);
      const base = Date.parse("2020-01-02T00:00:00Z");
      for (let i = 0; i < 45; i++) await addComment(db, BOB, subject, i, new Date(base + Math.floor(i / 2) * 60_000));

      const pages = [];
      let cursor: string | null = null;
      do {
        const page = await getComments({ db, cookUri: subject, cursor });
        pages.push(page.items.map((c) => c.text));
        cursor = page.cursor;
      } while (cursor);
      expect(pages.map((p) => p.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 5]);
      expect(pages.flat()).toEqual(Array.from({ length: 45 }, (_, i) => `c${i}`));
    });
  });
});

describe("orphans (§6.2)", () => {
  // Bob's kudos and comment on Alice's cook: hidden while the cook is gone
  // or hidden, but the rows (Bob's records) are kept.
  async function setup(db: Kysely<DatabaseSchema>) {
    await seed(db, ALICE, 1, () => new Date("2020-01-01T00:00:00Z"));
    await seed(db, BOB, 1, () => new Date("2020-01-01T00:00:00Z"));
    const subject = cookUri(ALICE, 0);
    await db
      .insertInto("kudos")
      .values({ uri: `at://${BOB}/${COLLECTIONS.kudos}/${rkey(0)}`, authorDid: BOB, subjectUri: subject, subjectCid: CID, createdAt: new Date() })
      .execute();
    await addComment(db, BOB, subject, 0, new Date());
    return subject;
  }
  const rowCounts = async (db: Kysely<DatabaseSchema>) =>
    Promise.all(
      (["kudos", "comment"] as const).map(async (t) =>
        Number((await db.selectFrom(t).select((eb) => eb.fn.countAll().as("n")).where("authorDid", "=", BOB).executeTakeFirstOrThrow()).n),
      ),
    );

  it("hides kudos and comments on a deleted cook, keeping the rows", async () => {
    await inRollback(async (db) => {
      const subject = await setup(db);
      expect((await getComments({ db, cookUri: subject })).items).toHaveLength(1);
      expect(await getVisibleCook(subject, db)).not.toBeNull();

      await db.deleteFrom("cook").where("uri", "=", subject).execute();
      expect(await getCookDetail(ALICE, rkey(0), db)).toBeNull();
      expect((await getComments({ db, cookUri: subject })).items).toEqual([]);
      expect(await getVisibleCook(subject, db)).toBeNull();
      expect(await rowCounts(db)).toEqual([1, 1]);
      // Bob's own cook still shows its counts untouched.
      expect((await getCookFeed({ db, authorDid: BOB })).items).toHaveLength(1);
    });
  });

  it("hides them while the cook's author is inactive, and shows them again after", async () => {
    await inRollback(async (db) => {
      const subject = await setup(db);
      await db.updateTable("account").set({ active: false }).where("did", "=", ALICE).execute();
      expect(await getCookDetail(ALICE, rkey(0), db)).toBeNull();
      expect((await getComments({ db, cookUri: subject })).items).toEqual([]);
      expect(await getVisibleCook(subject, db)).toBeNull();
      expect(await rowCounts(db)).toEqual([1, 1]);

      await db.updateTable("account").set({ active: true }).where("did", "=", ALICE).execute();
      const detail = await getCookDetail(ALICE, rkey(0), db);
      expect([detail?.kudos.length, detail?.comments.items.length, detail?.cook.kudosCount]).toEqual([1, 1, 1]);
    });
  });
});

describe("getKudosUri", () => {
  it("returns the viewer's kudos on that cook only", async () => {
    await inRollback(async (db) => {
      const subject = cookUri(ALICE, 0);
      const uri = `at://${BOB}/${COLLECTIONS.kudos}/${rkey(0)}`;
      await db.insertInto("kudos").values({ uri, authorDid: BOB, subjectUri: subject, subjectCid: CID, createdAt: new Date() }).execute();
      expect(await getKudosUri(BOB, subject, db)).toBe(uri);
      expect(await getKudosUri(ALICE, subject, db)).toBeNull();
      expect(await getKudosUri(BOB, cookUri(ALICE, 1), db)).toBeNull();
    });
  });
});

describe("DENYLIST_DIDS (§7)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hides the account, its cooks, kudos and comments everywhere, and brings them back when removed", async () => {
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
      await addFollow(db, ALICE, BOB);
      await addFollow(db, CAROL, BOB);
      await db.insertInto("account").values({ did: CAROL, handle: HANDLES[CAROL] }).execute();

      const bobVisible = async () => ({
        global: (await getCookFeed({ db })).items.some((c) => c.author.did === BOB),
        following: (await getCookFeed({ db, followedBy: ALICE })).items.some((c) => c.author.did === BOB),
        profile: (await getAccount(BOB, db)) !== null,
        byHandle: (await getAccount("bob.test", db)) !== null,
        detail: (await getCookDetail(BOB, rkey(0), db)) !== null,
        cook: (await getVisibleCook(cookUri(BOB, 0), db)) !== null,
        counts: (await getCookFeed({ db, authorDid: ALICE })).items.map((c) => [c.kudosCount, c.commentCount]),
        kudos: (await getCookDetail(ALICE, rkey(0), db))!.kudos.length,
        comments: (await getComments({ cookUri: subjectUri, db })).items.length,
        import: (await getImportCandidates(DAVE, [BOB], db)).length,
        days: (await getCookDayCounts(BOB, { from: "2020-01-01", to: "2020-01-01" }, db)).length,
      });
      const shown = { global: true, following: true, profile: true, byHandle: true, detail: true, cook: true, counts: [[1, 1]], kudos: 1, comments: 1, import: 1, days: 1 };
      expect(await bobVisible()).toEqual(shown);

      // Invalid entries and separators are tolerated.
      vi.stubEnv("DENYLIST_DIDS", ` not-a-did, ${DAVE}\n${BOB} `);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await bobVisible()).toEqual({
        global: false, following: false, profile: false, byHandle: false, detail: false, cook: false,
        counts: [[0, 0]], kudos: 0, comments: 0, import: 0, days: 0,
      });
      // Others are unaffected.
      expect((await getCookFeed({ db, authorDid: ALICE })).items).toHaveLength(1);

      vi.stubEnv("DENYLIST_DIDS", "");
      expect(await bobVisible()).toEqual(shown);
    });
  });
});

describe("getCookDayCounts", () => {
  it("counts cooks per author-local date within the window", async () => {
    await inRollback(async (db) => {
      await seed(db, ALICE, 0, () => new Date());
      await seed(db, BOB, 1, () => new Date("2026-09-28T12:00:00Z"));
      const cooks: [string, string][] = [
        ["2026-09-27T22:30:00-04:00", "2026-09-27"], // Mon 02:30 UTC, still Sunday for the author
        ["2026-09-28T07:00:00+09:00", "2026-09-28"], // Sun 22:00 UTC, already Monday for the author
        ["2026-09-28T19:00:00+09:00", "2026-09-28"],
        ["2026-08-31T12:00:00Z", "2026-08-31"], // outside the window
      ];
      for (const [i, [cookedAt, cookedLocalDate]] of cooks.entries()) {
        const at = new Date(cookedAt);
        await db
          .insertInto("cook")
          .values({
            uri: cookUri(ALICE, i),
            cid: CID,
            authorDid: ALICE,
            dishName: "Dish",
            mealType: "dinner",
            images: JSON.stringify([]),
            cookedAt,
            cookedAtUtc: at,
            cookedLocalDate,
            createdAt: at,
            indexedAt: at,
            sortAt: at,
          })
          .execute();
      }
      expect(await getCookDayCounts(ALICE, { from: "2026-09-01", to: "2026-10-31" }, db)).toEqual([
        { date: "2026-09-27", count: 1 },
        { date: "2026-09-28", count: 2 },
      ]);
    });
  });
});
