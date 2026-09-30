import { TID } from "@atproto/common-web";
import { type Client, l } from "@atproto/lex";
import { AtUri } from "@atproto/syntax";
import type { Kysely } from "kysely";
import { COLLECTIONS } from "../config";
import type { DatabaseSchema } from "../db/schema";
import { ensureAccount } from "../indexer/account";
import { followRow, upsertFollow } from "../indexer/follow";
import { follow } from "../lexicons";

type Db = Kysely<DatabaseSchema>;

// Follow writes: to the user's PDS first, then the index (read-your-own-
// writes, §3). Tap delivers the same records later as no-ops. A failure
// after the PDS write is logged, not surfaced: Tap will index it anyway.

// applyWrites batch size (§6.3; the PDS allows more, the spec says ≤100).
export const IMPORT_BATCH = 100;

export const followUri = (did: string, rkey: string) =>
  AtUri.make(did, COLLECTIONS.follow, rkey).toString();

function followRecord(subject: string): follow.Main {
  return follow.$parse({ $type: COLLECTIONS.follow, subject, createdAt: l.currentDatetimeString() });
}

async function indexOwnFollows(db: Db, me: string, rows: { rkey: string; record: follow.Main }[]) {
  try {
    await ensureAccount(db, me);
    for (const { rkey, record } of rows) {
      await upsertFollow(db, followRow({ uri: followUri(me, rkey), authorDid: me, record }));
    }
  } catch (err) {
    console.error("read-your-own-writes follow upsert failed", me, err);
  }
}

// One follow. `rkey` is a TID from the client, reused on retry: if an
// earlier attempt landed but its response was lost, the retry finds that
// record instead of creating a second follow.
export async function createFollow(client: Client, db: Db, me: string, subject: string, rkey: string) {
  let record = followRecord(subject);
  try {
    await client.create(follow, record, { rkey });
  } catch (err) {
    const existing = await client.get(follow, { rkey }).catch(() => null);
    if (!existing) throw err;
    record = existing.value;
  }
  await indexOwnFollows(db, me, [{ rkey, record }]);
  return followUri(me, rkey);
}

// Deletes the follow record at uri (one of the viewer's own).
export async function deleteFollow(client: Client, db: Db, uri: string) {
  await client.delete(follow, { rkey: new AtUri(uri).rkey });
  await db.deleteFrom("follow").where("uri", "=", uri).execute();
}

// Bluesky import: follow every subject with batched applyWrites. Each batch
// is atomic on the PDS and indexed as soon as it lands, so after a failure
// a retry (which re-filters out already-followed accounts) resumes where it
// stopped. Returns how many were followed; `error` is set if a batch failed.
export async function followMany(
  client: Client,
  db: Db,
  me: string,
  subjects: string[],
): Promise<{ followed: number; error?: unknown }> {
  let followed = 0;
  for (let i = 0; i < subjects.length; i += IMPORT_BATCH) {
    const batch = subjects.slice(i, i + IMPORT_BATCH).map((subject) => ({
      rkey: TID.nextStr(),
      record: followRecord(subject),
    }));
    try {
      await client.applyWrites((op) => batch.map(({ rkey, record }) => op.create(follow, record, { rkey })));
    } catch (error) {
      return { followed, error };
    }
    await indexOwnFollows(db, me, batch);
    followed += batch.length;
  }
  return { followed };
}
