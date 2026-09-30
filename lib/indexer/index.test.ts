import { jsonToLex } from "@atproto/lex";
import { parseTapEvent } from "@atproto/tap";
import type { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from "../db";
import { inRollback } from "../db/testing";
import type { DatabaseSchema } from "../db/schema";
import { indexEvent } from ".";
import { cookRow, upsertCook } from "./cook";
import { cook } from "../lexicons";

// Real SQL in a rolled-back transaction (lib/db/testing.ts). Assertions
// only look at rows for the test DIDs below.
const ALICE = "did:plc:testalice00000000000000a";
const BOB = "did:plc:testbob000000000000000b";
const DIDS = [ALICE, BOB];
const CID1 = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const CID2 = "bafyreihmsoquhgytsqbyiegd2sytontm55s765olkl5nzdoabvhud46kia";
const RKEY = "3mwovhkvtw723";
const RKEY2 = "3mwovhkvtw223";
const COOK_URI = `at://${ALICE}/${COLLECTIONS.cook}/${RKEY}`;

afterAll(() => getDb().destroy());

// Tap webhook JSON -> event, exactly as app/api/webhook/route.ts does it.
let nextId = 1;
const recordEvt = (
  did: string,
  collection: string,
  rkey: string,
  action: "create" | "update" | "delete",
  record?: object,
  cid = CID2,
) =>
  parseTapEvent(
    jsonToLex({
      id: nextId++,
      type: "record",
      record: {
        live: true,
        rev: "3mwp5abcdef22",
        did,
        collection,
        rkey,
        action,
        ...(action === "delete" ? {} : { cid, record }),
      },
    }),
  );

const identityEvt = (did: string, status: string, handle = "alice.test") =>
  parseTapEvent(
    jsonToLex({
      id: nextId++,
      type: "identity",
      identity: { did, handle, is_active: status === "active", status },
    }),
  );

const blob = (mimeType = "image/jpeg") => ({
  $type: "blob",
  ref: { $link: CID1 },
  mimeType,
  size: 1234,
});

const cookJson = (overrides: object = {}) => ({
  $type: COLLECTIONS.cook,
  dishName: "Cacio e pepe",
  mealType: "dinner",
  images: [{ image: blob(), aspectRatio: { width: 3, height: 4 } }],
  cookedAt: "2026-09-29T21:00:00-04:00",
  createdAt: "2026-09-30T01:05:00.000Z",
  ...overrides,
});
const strongRef = { uri: COOK_URI, cid: CID2 };
const kudosJson = (createdAt = "2026-09-30T02:00:00.000Z", subject = strongRef) => ({
  $type: COLLECTIONS.kudos,
  subject,
  createdAt,
});
const commentJson = (text = "Looks great", createdAt = "2026-09-30T02:00:00.000Z") => ({
  $type: COLLECTIONS.comment,
  subject: strongRef,
  text,
  createdAt,
});
const followJson = { $type: COLLECTIONS.follow, subject: ALICE, createdAt: "2026-09-30T02:00:00.000Z" };
const profileJson = {
  $type: "app.bsky.actor.profile",
  displayName: "Alice",
  avatar: { $type: "blob", ref: { $link: CID1 }, mimeType: "image/png", size: 999 },
};

// Every index row belonging to the test DIDs.
async function snapshot(db: Kysely<DatabaseSchema>) {
  return {
    account: await db.selectFrom("account").selectAll().where("did", "in", DIDS).orderBy("did").execute(),
    cook: await db.selectFrom("cook").selectAll().where("authorDid", "in", DIDS).orderBy("uri").execute(),
    kudos: await db.selectFrom("kudos").selectAll().where("authorDid", "in", DIDS).orderBy("uri").execute(),
    comment: await db.selectFrom("comment").selectAll().where("authorDid", "in", DIDS).orderBy("uri").execute(),
    follow: await db.selectFrom("follow").selectAll().where("authorDid", "in", DIDS).orderBy("uri").execute(),
  };
}

describe("indexEvent: replaying an event changes nothing", () => {
  // Cook and comment are future-dated, so sortAt = indexedAt: a replay that
  // re-stamped either would show up as a change.
  const FUTURE = "2030-01-01T00:00:00.000Z";
  const events = () => [
    ["identity", identityEvt(ALICE, "active")],
    ["profile", recordEvt(ALICE, "app.bsky.actor.profile", "self", "create", profileJson)],
    ["cook", recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson({ createdAt: FUTURE }))],
    ["kudos", recordEvt(BOB, COLLECTIONS.kudos, RKEY, "create", kudosJson())],
    ["comment", recordEvt(BOB, COLLECTIONS.comment, RKEY, "create", commentJson(undefined, FUTURE))],
    ["follow", recordEvt(BOB, COLLECTIONS.follow, RKEY, "create", followJson)],
    ["cook delete", recordEvt(ALICE, COLLECTIONS.cook, RKEY, "delete")],
    ["profile delete", recordEvt(ALICE, "app.bsky.actor.profile", "self", "delete")],
  ] as const;

  it("applies each event once, then a replay of every event is a no-op", async () => {
    await inRollback(async (db) => {
      const evts = events();
      for (const [name, evt] of evts) {
        const outcome = await indexEvent(db, evt);
        expect(outcome.kind, name).not.toBe("dropped");
        const before = await snapshot(db);
        // Same event again, later (Tap redelivery after a timeout).
        await indexEvent(db, evt, new Date(Date.now() + 60_000));
        expect(await snapshot(db), `replay of ${name}`).toEqual(before);
      }
    });
  });

  it("replaying the whole stream from the start is a no-op", async () => {
    await inRollback(async (db) => {
      const evts = events().slice(0, 6);
      for (const [, evt] of evts) await indexEvent(db, evt);
      const before = await snapshot(db);
      for (const [, evt] of evts) await indexEvent(db, evt, new Date(Date.now() + 60_000));
      expect(await snapshot(db)).toEqual(before);
      expect(before.cook).toHaveLength(1);
      expect(before.kudos).toHaveLength(1);
      expect(before.comment).toHaveLength(1);
      expect(before.follow).toHaveLength(1);
      expect(before.account.find((a) => a.did === ALICE)).toMatchObject({
        handle: "alice.test",
        displayName: "Alice",
        avatarCid: CID1,
        active: true,
      });
    });
  });

  it("Tap delivering a cook after the read-your-own-writes upsert is a no-op", async () => {
    await inRollback(async (db) => {
      const record = cook.$parse(jsonToLex(cookJson()));
      await upsertCook(db, cookRow({ uri: COOK_URI, cid: CID2, authorDid: ALICE, record }));
      const before = await snapshot(db);
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson()), new Date(Date.now() + 60_000));
      expect((await snapshot(db)).cook).toEqual(before.cook);
    });
  });
});

describe("indexEvent: records", () => {
  it("indexes a cook and deletes it", async () => {
    await inRollback(async (db) => {
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson()));
      const [row] = (await snapshot(db)).cook;
      expect(row).toMatchObject({ uri: COOK_URI, cid: CID2, dishName: "Cacio e pepe", cookedLocalDate: "2026-09-29" });
      expect(row.images).toEqual([{ cid: CID1, mime: "image/jpeg", alt: null, aspectRatio: { width: 3, height: 4 } }]);
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "delete"));
      expect((await snapshot(db)).cook).toEqual([]);
    });
  });

  it("an update with a new cid replaces content but keeps sortAt", async () => {
    await inRollback(async (db) => {
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson()));
      const [before] = (await snapshot(db)).cook;
      await indexEvent(
        db,
        recordEvt(ALICE, COLLECTIONS.cook, RKEY, "update", cookJson({ dishName: "Carbonara", createdAt: "2020-01-01T00:00:00Z" }), CID1),
      );
      const [after] = (await snapshot(db)).cook;
      expect(after.dishName).toBe("Carbonara");
      expect(after.cid).toBe(CID1);
      expect(after.sortAt).toEqual(before.sortAt);
      expect(after.indexedAt).toEqual(before.indexedAt);
    });
  });

  it.each([
    ["5 images", cookJson({ images: Array(5).fill({ image: blob(), aspectRatio: { width: 1, height: 1 } }) })],
    ["png image", cookJson({ images: [{ image: blob("image/png"), aspectRatio: { width: 1, height: 1 } }] })],
    ["empty dishName", cookJson({ dishName: "" })],
    ["no offset in cookedAt", cookJson({ cookedAt: "2026-09-29T21:00:00" })],
    ["wrong $type", cookJson({ $type: COLLECTIONS.kudos })],
  ])("drops an invalid cook (%s) without indexing anything", async (_, json) => {
    await inRollback(async (db) => {
      const outcome = await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", json));
      expect(outcome.kind).toBe("dropped");
      expect(await snapshot(db)).toEqual({ account: [], cook: [], kudos: [], comment: [], follow: [] });
    });
  });

  it("drops records with a non-TID rkey, and profiles not at self", async () => {
    await inRollback(async (db) => {
      expect((await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, "hello", "create", cookJson()))).kind).toBe("dropped");
      expect((await indexEvent(db, recordEvt(ALICE, "app.bsky.actor.profile", RKEY, "create", profileJson))).kind).toBe("dropped");
      expect(await snapshot(db)).toEqual({ account: [], cook: [], kudos: [], comment: [], follow: [] });
    });
  });

  it("drops kudos and comments whose subject is not a cook", async () => {
    await inRollback(async (db) => {
      const notCook = { uri: `at://${ALICE}/app.bsky.feed.post/${RKEY}`, cid: CID2 };
      const k = await indexEvent(db, recordEvt(BOB, COLLECTIONS.kudos, RKEY, "create", kudosJson(undefined, notCook)));
      const c = await indexEvent(db, recordEvt(BOB, COLLECTIONS.comment, RKEY, "create", { ...commentJson(), subject: notCook }));
      expect([k.kind, c.kind]).toEqual(["dropped", "dropped"]);
      expect((await snapshot(db)).kudos).toEqual([]);
    });
  });

  it("keeps the earliest kudos per (author, cook), whatever the arrival order", async () => {
    for (const order of [[RKEY, RKEY2], [RKEY2, RKEY]]) {
      await inRollback(async (db) => {
        const created: Record<string, string> = { [RKEY]: "2026-09-30T02:00:00.000Z", [RKEY2]: "2026-09-30T01:00:00.000Z" };
        for (const rkey of order) {
          await indexEvent(db, recordEvt(BOB, COLLECTIONS.kudos, rkey, "create", kudosJson(created[rkey])));
        }
        const { kudos } = await snapshot(db);
        expect(kudos).toHaveLength(1);
        expect(kudos[0].uri).toBe(`at://${BOB}/${COLLECTIONS.kudos}/${RKEY2}`);
      });
    }
  });

  it("ignores collections outside the index", async () => {
    await inRollback(async (db) => {
      const outcome = await indexEvent(db, recordEvt(ALICE, "app.bsky.feed.post", RKEY, "create", { text: "hi" }));
      expect(outcome.kind).toBe("ignored");
    });
  });
});

describe("indexEvent: identity", () => {
  it("hides an inactive account but keeps its rows", async () => {
    await inRollback(async (db) => {
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson()));
      await indexEvent(db, identityEvt(ALICE, "deactivated"));
      const snap = await snapshot(db);
      expect(snap.account[0].active).toBe(false);
      expect(snap.cook).toHaveLength(1);
      await indexEvent(db, identityEvt(ALICE, "active"));
      expect((await snapshot(db)).account[0].active).toBe(true);
    });
  });

  it("stores handle.invalid as no handle", async () => {
    await inRollback(async (db) => {
      await indexEvent(db, identityEvt(ALICE, "active", "handle.invalid"));
      expect((await snapshot(db)).account[0].handle).toBeNull();
    });
  });

  it("purges a deleted account's rows but not other people's rows about it", async () => {
    await inRollback(async (db) => {
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.cook, RKEY, "create", cookJson()));
      await indexEvent(db, recordEvt(ALICE, COLLECTIONS.kudos, RKEY, "create", kudosJson()));
      await indexEvent(db, recordEvt(BOB, COLLECTIONS.kudos, RKEY, "create", kudosJson()));
      await indexEvent(db, recordEvt(BOB, COLLECTIONS.follow, RKEY, "create", followJson));
      await indexEvent(db, identityEvt(ALICE, "deleted"));
      const snap = await snapshot(db);
      expect(snap.account.map((a) => a.did)).toEqual([BOB]);
      expect(snap.cook).toEqual([]);
      expect(snap.kudos.map((k) => k.authorDid)).toEqual([BOB]);
      expect(snap.follow).toHaveLength(1);
    });
  });
});
