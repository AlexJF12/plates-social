import { type Client, l } from "@atproto/lex";
import { AtUri } from "@atproto/syntax";
import type { Kysely } from "kysely";
import { COLLECTIONS } from "../config";
import type { DatabaseSchema } from "../db/schema";
import { ensureAccount } from "../indexer/account";
import { commentRow, upsertComment } from "../indexer/comment";
import { kudosRow, upsertKudos } from "../indexer/kudos";
import { comment, cook, kudos } from "../lexicons";

type Db = Kysely<DatabaseSchema>;
type StrongRef = { uri: string; cid: string };

// Kudos, comment and delete writes (§6.6): to the user's PDS first, then the
// index (read-your-own-writes, §3). Tap delivers the same records later as
// no-ops. A failure after the PDS write is logged, not surfaced: Tap will
// index it anyway. Same shape as lib/follows/write.ts.

// Throws if the text breaks a §4 limit (empty, > 500 graphemes, …).
export function commentRecord(subject: StrongRef, text: string): comment.Main {
  return comment.$parse({
    $type: COLLECTIONS.comment,
    subject,
    text: text.trim(),
    createdAt: l.currentDatetimeString(),
  });
}

async function readYourOwnWrite(db: Db, me: string, write: () => Promise<void>) {
  try {
    await ensureAccount(db, me);
    await write();
  } catch (err) {
    console.error("read-your-own-writes upsert failed", me, err);
  }
}

// `rkey` is a TID from the client, reused on retry: if an earlier attempt
// landed but its response was lost, the retry finds that record instead of
// creating a second kudos.
export async function createKudos(client: Client, db: Db, me: string, subject: StrongRef, rkey: string) {
  let record = kudos.$parse({ $type: COLLECTIONS.kudos, subject, createdAt: l.currentDatetimeString() });
  try {
    await client.create(kudos, record, { rkey });
  } catch (err) {
    const existing = await client.get(kudos, { rkey }).catch(() => null);
    if (!existing) throw err;
    record = existing.value;
  }
  const uri = AtUri.make(me, COLLECTIONS.kudos, rkey).toString();
  await readYourOwnWrite(db, me, () => upsertKudos(db, kudosRow({ uri, authorDid: me, record })));
  return uri;
}

// Same retry rule as createKudos. Returns the uri and the record as written
// (the recovered one if an earlier attempt landed).
export async function createComment(client: Client, db: Db, me: string, record: comment.Main, rkey: string) {
  try {
    await client.create(comment, record, { rkey });
  } catch (err) {
    const existing = await client.get(comment, { rkey }).catch(() => null);
    if (!existing) throw err;
    record = existing.value;
  }
  const uri = AtUri.make(me, COLLECTIONS.comment, rkey).toString();
  await readYourOwnWrite(db, me, () => upsertComment(db, commentRow({ uri, authorDid: me, record })));
  return { uri, record };
}

// Deletes one of the viewer's own records and its row. deleteRecord on a
// record that is already gone succeeds, so a retry after a lost response is
// harmless. Kudos and comments other people left on a deleted cook stay in
// the index (they're their records), hidden by the read queries (§6.2).
export async function deleteOwnRecord(client: Client, db: Db, kind: "kudos" | "comment" | "cook", uri: string) {
  const rkey = new AtUri(uri).rkey;
  if (kind === "kudos") await client.delete(kudos, { rkey });
  else if (kind === "comment") await client.delete(comment, { rkey });
  else await client.delete(cook, { rkey });
  await db.deleteFrom(kind).where("uri", "=", uri).execute();
}
