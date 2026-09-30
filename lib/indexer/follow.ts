import type { Insertable, Kysely } from "kysely";
import type { DatabaseSchema, FollowTable } from "../db/schema";
import type { follow } from "../lexicons";

// createdAt is always set, so the keep-the-earliest comparison has a value.
export type FollowRow = Insertable<FollowTable> & { createdAt: Date };

// The record must already have passed follow.$parse.
export function followRow(args: {
  uri: string;
  authorDid: string;
  record: follow.Main;
}): FollowRow {
  return {
    uri: args.uri,
    authorDid: args.authorDid,
    subjectDid: args.record.subject,
    createdAt: new Date(args.record.createdAt),
  };
}

// One follow per (author, subject); the earliest wins. Same shape as
// upsertKudos: idempotent single statements, no transaction.
export async function upsertFollow(
  db: Kysely<DatabaseSchema>,
  row: FollowRow,
): Promise<void> {
  await db
    .deleteFrom("follow")
    .where("uri", "=", row.uri)
    .where("subjectDid", "!=", row.subjectDid)
    .execute();

  const inserted = await db
    .insertInto("follow")
    .values(row)
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
  if (inserted.numInsertedOrUpdatedRows) return;

  await db
    .updateTable("follow")
    .set({ uri: row.uri, createdAt: row.createdAt })
    .where("authorDid", "=", row.authorDid)
    .where("subjectDid", "=", row.subjectDid)
    .where("createdAt", ">", row.createdAt)
    .execute();
}
