import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from ".";
import { PAGE_SIZE, getCookDetail, getCookFeed, searchCooks } from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

// viewerKudos (Phase 6.7) against the local Postgres, in rolled-back
// transactions.

type Db = Kysely<DatabaseSchema>;

const A = "did:plc:testvkudosa00000000000";
const B = "did:plc:testvkudosb00000000000";
const C = "did:plc:testvkudosc00000000000";
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

afterAll(() => getDb().destroy());
afterEach(() => vi.unstubAllEnvs());

const rkey = (i: number) => `3mwvkud${String(i).padStart(6, "0")}`;
const uriOf = (did: string, i: number) => `at://${did}/${COLLECTIONS.cook}/${rkey(i)}`;

async function seed(db: Db, cooks = 2) {
  await db.insertInto("account").values([A, B, C].map((did) => ({ did, handle: `${did.slice(-12)}.test` }))).execute();
  for (let i = 0; i < cooks; i++) {
    const at = new Date(Date.UTC(2020, 0, 1, 0, i));
    await db
      .insertInto("cook")
      .values({
        uri: uriOf(A, i),
        cid: CID,
        authorDid: A,
        dishName: `zqvk dish ${i}`,
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

const kudos = (db: Db, author: string, i: number) =>
  db
    .insertInto("kudos")
    .values({ uri: `at://${author}/${COLLECTIONS.kudos}/${rkey(i)}`, authorDid: author, subjectUri: uriOf(A, i), subjectCid: CID, createdAt: new Date() })
    .execute();

const flags = async (db: Db, viewer: string | null) =>
  (await getCookFeed({ authorDid: A, viewer, db })).items.map((c) => [c.dishName, c.viewerKudos]);

describe("viewerKudos", () => {
  it("is true only for the viewer's own kudos, on feeds, detail and search", async () => {
    await inRollback(async (db) => {
      await seed(db);
      await kudos(db, B, 0);
      await kudos(db, C, 1);
      expect(await flags(db, B)).toEqual([
        ["zqvk dish 1", false],
        ["zqvk dish 0", true],
      ]);
      expect(await flags(db, C)).toEqual([
        ["zqvk dish 1", true],
        ["zqvk dish 0", false],
      ]);
      // Signed out (no viewer): always false.
      expect(await flags(db, null)).toEqual([
        ["zqvk dish 1", false],
        ["zqvk dish 0", false],
      ]);
      expect((await getCookDetail(A, rkey(0), db, B))?.cook.viewerKudos).toBe(true);
      expect((await getCookDetail(A, rkey(0), db, C))?.cook.viewerKudos).toBe(false);
      expect((await searchCooks({ q: "zqvk dish 0", viewer: B, db })).items.map((c) => c.viewerKudos)).toEqual([true]);
    });
  });

  it("is false when the viewer's own account is hidden", async () => {
    await inRollback(async (db) => {
      await seed(db, 1);
      await kudos(db, B, 0);
      vi.stubEnv("DENYLIST_DIDS", B);
      expect(await flags(db, B)).toEqual([["zqvk dish 0", false]]);
      vi.unstubAllEnvs();
      await db.updateTable("account").set({ active: false }).where("did", "=", B).execute();
      expect(await flags(db, B)).toEqual([["zqvk dish 0", false]]);
    });
  });

  it("adds no query per card: a full page is the same number of queries as one cook", async () => {
    // Its own connection with query logging, in a rolled-back transaction.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    let count = 0;
    const logged = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool }),
      log: (e) => {
        if (e.level === "query") count++;
      },
    });
    try {
      await logged
        .transaction()
        .execute(async (trx) => {
          await seed(trx, 1);
          count = 0;
          await getCookFeed({ authorDid: A, viewer: B, db: trx });
          const one = count;

          for (let i = 1; i <= PAGE_SIZE + 5; i++) {
            await trx
              .insertInto("cook")
              .values({
                uri: uriOf(A, i),
                cid: CID,
                authorDid: A,
                dishName: `zqvk dish ${i}`,
                mealType: "dinner",
                images: "[]",
                cookedAt: "2020-01-02T00:00:00Z",
                cookedAtUtc: new Date("2020-01-02T00:00:00Z"),
                cookedLocalDate: "2020-01-02",
                createdAt: new Date("2020-01-02T00:00:00Z"),
                indexedAt: new Date("2020-01-02T00:00:00Z"),
                sortAt: new Date(Date.UTC(2020, 0, 2, 0, i)),
              })
              .execute();
            await kudos(trx, B, i);
          }
          count = 0;
          const page = await getCookFeed({ authorDid: A, viewer: B, db: trx });
          expect(page.items).toHaveLength(PAGE_SIZE);
          expect(page.items.every((c) => c.viewerKudos)).toBe(true);
          expect(count).toBe(one);
          throw new Error("rollback");
        })
        .catch((e) => {
          if (e.message !== "rollback") throw e;
        });
    } finally {
      await logged.destroy();
    }
  });
});
