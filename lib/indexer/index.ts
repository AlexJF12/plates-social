import type { LexMap } from "@atproto/lex";
import type { TapEvent } from "@atproto/tap";
import { AtUri, isValidTid } from "@atproto/syntax";
import type { Kysely } from "kysely";
import { COLLECTIONS } from "../config";
import type { DatabaseSchema } from "../db/schema";
import { bskyProfile, comment, cook, follow, kudos } from "../lexicons";
import { ensureAccount, purgeAccount, upsertIdentity, upsertProfile } from "./account";
import { commentRow, upsertComment } from "./comment";
import { cookRow, upsertCook } from "./cook";
import { followRow, upsertFollow } from "./follow";
import { kudosRow, upsertKudos } from "./kudos";

const PROFILE = "app.bsky.actor.profile";

export type IndexOutcome =
  | { kind: "indexed" | "deleted" | "identity" | "purged" | "ignored" }
  | { kind: "dropped"; reason: string };

const TABLE_FOR = {
  [COLLECTIONS.cook]: "cook",
  [COLLECTIONS.kudos]: "kudos",
  [COLLECTIONS.comment]: "comment",
  [COLLECTIONS.follow]: "follow",
} as const;
type OurCollection = keyof typeof TABLE_FOR;
const isOurCollection = (c: string): c is OurCollection => c in TABLE_FOR;

// Kudos and comments must point at a cook (§4). The Lexicon only says
// "strongRef", so check the collection here.
function isCookUri(uri: string): boolean {
  try {
    return new AtUri(uri).collection === COLLECTIONS.cook;
  } catch {
    return false;
  }
}

// Apply one Tap event to the index. Everything here is idempotent: Tap
// delivers at least once (§6.1), so the same event can arrive repeatedly.
// Records from the network are untrusted (§0.6): anything that fails its
// Lexicon or a §4 rule is dropped whole, never partially indexed. The
// record must already be in lex form (jsonToLex), as $parse expects.
export async function indexEvent(
  db: Kysely<DatabaseSchema>,
  evt: TapEvent,
  now: Date = new Date(),
): Promise<IndexOutcome> {
  if (evt.type === "identity") {
    if (evt.status === "deleted") {
      await purgeAccount(db, evt.did);
      return { kind: "purged" };
    }
    // takendown / suspended / deactivated: hide, keep the rows.
    await upsertIdentity(db, { did: evt.did, handle: evt.handle, active: evt.isActive });
    return { kind: "identity" };
  }

  const { did, collection, rkey, action } = evt;
  const uri = AtUri.make(did, collection, rkey).toString();

  if (collection === PROFILE) {
    if (rkey !== "self") return { kind: "dropped", reason: "profile rkey is not self" };
    if (action === "delete") {
      await upsertProfile(db, did, null);
      return { kind: "deleted" };
    }
    const record = parse(bskyProfile, evt.record);
    if (!record.ok) return record.dropped;
    await upsertProfile(db, did, record.value);
    return { kind: "indexed" };
  }

  if (!isOurCollection(collection)) return { kind: "ignored" };
  if (!isValidTid(rkey)) return { kind: "dropped", reason: "rkey is not a TID" };

  if (action === "delete") {
    await db.deleteFrom(TABLE_FOR[collection]).where("uri", "=", uri).execute();
    return { kind: "deleted" };
  }

  if (!evt.cid) return { kind: "dropped", reason: "no cid" };
  const cid = evt.cid;

  switch (collection) {
    case COLLECTIONS.cook: {
      const record = parse(cook, evt.record);
      if (!record.ok) return record.dropped;
      await ensureAccount(db, did);
      await upsertCook(db, cookRow({ uri, cid, authorDid: did, record: record.value, indexedAt: now }));
      break;
    }
    case COLLECTIONS.kudos: {
      const record = parse(kudos, evt.record);
      if (!record.ok) return record.dropped;
      if (!isCookUri(record.value.subject.uri)) {
        return { kind: "dropped", reason: "subject is not a cook" };
      }
      await ensureAccount(db, did);
      await upsertKudos(db, kudosRow({ uri, authorDid: did, record: record.value }));
      break;
    }
    case COLLECTIONS.comment: {
      const record = parse(comment, evt.record);
      if (!record.ok) return record.dropped;
      if (!isCookUri(record.value.subject.uri)) {
        return { kind: "dropped", reason: "subject is not a cook" };
      }
      await ensureAccount(db, did);
      await upsertComment(db, commentRow({ uri, authorDid: did, record: record.value, indexedAt: now }));
      break;
    }
    case COLLECTIONS.follow: {
      const record = parse(follow, evt.record);
      if (!record.ok) return record.dropped;
      await ensureAccount(db, did);
      await upsertFollow(db, followRow({ uri, authorDid: did, record: record.value }));
      break;
    }
  }
  return { kind: "indexed" };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; dropped: IndexOutcome };

function parse<T>(
  schema: { $parse: (v: unknown) => T },
  record: LexMap | undefined,
): Parsed<T> {
  if (!record) return { ok: false, dropped: { kind: "dropped", reason: "no record" } };
  try {
    return { ok: true, value: schema.$parse(record) };
  } catch (err) {
    const reason = `invalid record: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, dropped: { kind: "dropped", reason } };
  }
}
