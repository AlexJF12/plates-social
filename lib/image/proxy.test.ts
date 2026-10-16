import type { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from "../db";
import type { DatabaseSchema } from "../db/schema";
import { inRollback } from "../db/testing";
import { isReferenced } from "./proxy";

// The proxy only serves CIDs referenced by an indexed record (§6.5).
const A = "did:plc:testproxya00000000000000a";
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const OTHER = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const images = (cid: string) => JSON.stringify([{ cid, mime: "image/jpeg", alt: null, aspectRatio: { width: 1, height: 1 } }]);
const t = new Date("2026-10-14T20:00:00Z");

afterAll(() => getDb().destroy());

async function visit(db: Kysely<DatabaseSchema>, cid: string) {
  await db.insertInto("account").values({ did: A }).execute();
  await db
    .insertInto("visit")
    .values({
      uri: `at://${A}/${COLLECTIONS.visit}/3mwovhkvtw723`,
      cid: OTHER,
      authorDid: A,
      restaurantName: "Lilia",
      rating: 4,
      mealType: "dinner",
      images: images(cid),
      visitedAt: "2026-10-14T16:00:00-04:00",
      visitedAtUtc: t,
      visitedLocalDate: "2026-10-14",
      createdAt: t,
      sortAt: t,
    })
    .execute();
}

describe("isReferenced", () => {
  it("serves a photo referenced by a visit", async () => {
    await inRollback(async (db) => {
      await visit(db, CID);
      expect(await isReferenced(A, CID, db)).toBe(true);
      expect(await isReferenced(A, OTHER, db)).toBe(false);
      expect(await isReferenced("did:plc:someoneelse000000000000", CID, db)).toBe(false);
    });
  });

  it("stops serving it when the visit is gone or the account is hidden", async () => {
    await inRollback(async (db) => {
      await visit(db, CID);
      await db.updateTable("account").set({ active: false }).where("did", "=", A).execute();
      expect(await isReferenced(A, CID, db)).toBe(false);
      await db.updateTable("account").set({ active: true }).where("did", "=", A).execute();
      await db.deleteFrom("visit").where("authorDid", "=", A).execute();
      expect(await isReferenced(A, CID, db)).toBe(false);
    });
  });
});
