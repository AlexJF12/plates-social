import type { Insertable, Kysely } from "kysely";
import type { DatabaseSchema, KudosTable } from "../db/schema";
import type { kudos } from "../lexicons";

// createdAt is always set, so the keep-the-earliest comparison has a value.
export type KudosRow = Insertable<KudosTable> & { createdAt: Date };

// The record must already have passed kudos.$parse and the cook-subject check
// in ./index.ts.
export function kudosRow(args: {
  uri: string;
  authorDid: string;
  record: kudos.Main;
}): KudosRow {
  return {
    uri: args.uri,
    authorDid: args.authorDid,
    subjectUri: args.record.subject.uri,
    subjectCid: args.record.subject.cid,
    createdAt: new Date(args.record.createdAt),
  };
}

// One kudos per (author, cook); if duplicates arrive, the earliest wins
// (§6.2). Idempotent, and written as single statements rather than a
// transaction so callers (and tests) can run it inside their own.
export async function upsertKudos(
  db: Kysely<DatabaseSchema>,
  row: KudosRow,
): Promise<void> {
  // An update that points this uri at a different cook drops the old row.
  await db
    .deleteFrom("kudos")
    .where("uri", "=", row.uri)
    .where("subjectUri", "!=", row.subjectUri)
    .execute();

  const inserted = await db
    .insertInto("kudos")
    .values(row)
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
  if (inserted.numInsertedOrUpdatedRows) return;

  // Either this uri is already indexed or the author has another kudos for
  // the same cook. Keep whichever was created first.
  await db
    .updateTable("kudos")
    .set({ uri: row.uri, subjectCid: row.subjectCid, createdAt: row.createdAt })
    .where("authorDid", "=", row.authorDid)
    .where("subjectUri", "=", row.subjectUri)
    .where("createdAt", ">", row.createdAt)
    .execute();
}
