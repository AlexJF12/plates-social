import type { Insertable, Kysely } from "kysely";
import type { CommentTable, DatabaseSchema } from "../db/schema";
import type { comment } from "../lexicons";

// The record must already have passed comment.$parse and the cook-subject check
// in ./index.ts.
export function commentRow(args: {
  uri: string;
  authorDid: string;
  record: comment.Main;
  indexedAt?: Date;
}): Insertable<CommentTable> {
  const indexedAt = args.indexedAt ?? new Date();
  const createdAt = new Date(args.record.createdAt);
  return {
    uri: args.uri,
    authorDid: args.authorDid,
    subjectUri: args.record.subject.uri,
    text: args.record.text,
    createdAt,
    // Same rule as cooks: a backdated or future createdAt can't reorder.
    sortAt: createdAt < indexedAt ? createdAt : indexedAt,
  };
}

// Idempotent. An update replaces the text but keeps sortAt.
export async function upsertComment(
  db: Kysely<DatabaseSchema>,
  row: Insertable<CommentTable>,
): Promise<void> {
  await db
    .insertInto("comment")
    .values(row)
    .onConflict((oc) =>
      oc.column("uri").doUpdateSet((eb) => ({
        subjectUri: eb.ref("excluded.subjectUri"),
        text: eb.ref("excluded.text"),
        createdAt: eb.ref("excluded.createdAt"),
      })),
    )
    .execute();
}
