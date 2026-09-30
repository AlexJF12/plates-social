import type { Kysely } from "kysely";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../config";
import { normalizeMeal, normalizeQuery } from "../search";
import { getDb } from ".";
import { PAGE_SIZE, searchCooks, searchPeople } from "./queries";
import type { DatabaseSchema } from "./schema";
import { inRollback } from "./testing";

// Search (Phase 6.6) against the local Postgres, in rolled-back
// transactions. Every test string contains "zq" so real cooks never match.

type Db = Kysely<DatabaseSchema>;

const A = "did:plc:testsearcha000000000000";
const B = "did:plc:testsearchb000000000000";
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

afterAll(() => getDb().destroy());
afterEach(() => vi.unstubAllEnvs());

let n = 0;
async function cook(db: Db, author: string, dishName: string, mealType = "dinner", at = new Date(Date.UTC(2020, 0, 1, 0, n))) {
  const uri = `at://${author}/${COLLECTIONS.cook}/3mwsrch${String(n++).padStart(6, "0")}`;
  await db
    .insertInto("cook")
    .values({
      uri,
      cid: CID,
      authorDid: author,
      dishName,
      mealType,
      images: JSON.stringify([{ cid: CID, mime: "image/jpeg", alt: null, aspectRatio: { width: 1, height: 1 } }]),
      cookedAt: at.toISOString(),
      cookedAtUtc: at,
      cookedLocalDate: at.toISOString().slice(0, 10),
      createdAt: at,
      indexedAt: at,
      sortAt: at,
    })
    .execute();
  return uri;
}

async function setup(db: Db) {
  await db
    .insertInto("account")
    .values([
      { did: A, handle: "zqalice.test", displayName: "Zqamélie Poulain" },
      { did: B, handle: "bob-zq.test", displayName: null },
    ])
    .execute();
}

const dishes = async (db: Db, q: string, mealType?: string) =>
  (await searchCooks({ q, mealType, db })).items.map((c) => c.dishName);

describe("searchCooks", () => {
  it("matches substrings, any case, accents either way", async () => {
    await inRollback(async (db) => {
      await setup(db);
      await cook(db, A, "Spaghetti zqcarbonara");
      await cook(db, A, "ZQ Crème brûlée");
      await cook(db, B, "zqlemon tart");
      expect(await dishes(db, "zqcarb")).toEqual(["Spaghetti zqcarbonara"]);
      expect(await dishes(db, "ZQCARB")).toEqual(["Spaghetti zqcarbonara"]);
      expect(await dishes(db, "zq creme")).toEqual(["ZQ Crème brûlée"]);
      expect(await dishes(db, "ZQ CRÈME BRUL")).toEqual(["ZQ Crème brûlée"]);
      // Newest first.
      expect(await dishes(db, "zq")).toEqual(["zqlemon tart", "ZQ Crème brûlée", "Spaghetti zqcarbonara"]);
    });
  });

  it("treats %, _ and \\ as literal characters", async () => {
    await inRollback(async (db) => {
      await setup(db);
      await cook(db, A, "zq 100% rye");
      await cook(db, A, "zq 1000 rye");
      await cook(db, A, "zq a_b");
      await cook(db, A, "zq axb");
      await cook(db, A, "zq back\\slash");
      expect(await dishes(db, "0% r")).toEqual(["zq 100% rye"]);
      expect(await dishes(db, "a_b")).toEqual(["zq a_b"]);
      expect(await dishes(db, "k\\s")).toEqual(["zq back\\slash"]);
      expect(await dishes(db, "%")).toEqual(["zq 100% rye"]);
    });
  });

  it("filters by meal type", async () => {
    await inRollback(async (db) => {
      await setup(db);
      await cook(db, A, "zq pancakes", "breakfast");
      await cook(db, A, "zq pasta", "dinner");
      expect(await dishes(db, "zq", "breakfast")).toEqual(["zq pancakes"]);
      expect(await dishes(db, "zq", "dessert")).toEqual([]);
    });
  });

  it("pages with the feed cursor, no gaps or repeats", async () => {
    await inRollback(async (db) => {
      await setup(db);
      const same = new Date(Date.UTC(2020, 0, 1));
      for (let i = 0; i < 45; i++) await cook(db, A, `zq dish ${i}`, "dinner", i % 2 ? same : new Date(same.getTime() + i * 60_000));
      const seen: string[] = [];
      let cursor: string | null = null;
      const sizes: number[] = [];
      do {
        const page = await searchCooks({ q: "zq dish", cursor, db });
        sizes.push(page.items.length);
        seen.push(...page.items.map((c) => c.uri));
        cursor = page.cursor;
      } while (cursor);
      expect(sizes).toEqual([PAGE_SIZE, PAGE_SIZE, 5]);
      expect(new Set(seen).size).toBe(45);
    });
  });

  it("hides denylisted and inactive authors", async () => {
    await inRollback(async (db) => {
      await setup(db);
      await cook(db, A, "zq soup");
      await cook(db, B, "zq stew");
      vi.stubEnv("DENYLIST_DIDS", A);
      expect(await dishes(db, "zq")).toEqual(["zq stew"]);
      await db.updateTable("account").set({ active: false }).where("did", "=", B).execute();
      expect(await dishes(db, "zq")).toEqual([]);
    });
  });
});

describe("searchPeople", () => {
  it("matches display names and handles, accents either way, and hides denylisted accounts", async () => {
    await inRollback(async (db) => {
      await setup(db);
      const names = async (q: string) => (await searchPeople(q, db)).map((a) => a.did);
      expect(await names("zqamelie")).toEqual([A]);
      expect(await names("ZQALICE")).toEqual([A]);
      expect(await names("bob-zq")).toEqual([B]);
      // Prefix matches ("zqalice", "Zqamélie") before others ("bob-zq").
      expect(await names("zq")).toEqual([A, B]);
      vi.stubEnv("DENYLIST_DIDS", A);
      expect(await names("zq")).toEqual([B]);
    });
  });
});

describe("query rules", () => {
  it("trims, needs 2 characters, caps at 100", () => {
    expect(normalizeQuery("  a ")).toBeNull();
    expect(normalizeQuery(" ab ")).toBe("ab");
    expect(normalizeQuery("a   b")).toBe("a b");
    expect(normalizeQuery("x".repeat(150))).toHaveLength(100);
    expect(normalizeQuery(null)).toBeNull();
  });

  it("accepts only known meal types", () => {
    expect(normalizeMeal("lunch")).toBe("lunch");
    expect(normalizeMeal("bake")).toBeNull();
    expect(normalizeMeal("")).toBeNull();
  });
});
