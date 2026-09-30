import { getBlobCidString, getBlobMime } from "@atproto/lex";
import type { Insertable, Kysely } from "kysely";
import type { cook } from "../lexicons";
import { localDateOf } from "../cook/datetime";
import type { CookImage, CookTable, DatabaseSchema } from "../db/schema";

// Record -> `cook` row. Used by the read-your-own-writes upsert now and the
// Tap webhook in Phase 3, so both paths index a record identically. The
// record must already have passed cook.$parse.
export function cookRow(args: {
  uri: string;
  cid: string;
  authorDid: string;
  record: cook.Main;
  indexedAt?: Date;
}): Insertable<CookTable> {
  const { uri, cid, authorDid, record } = args;
  const indexedAt = args.indexedAt ?? new Date();
  const createdAt = new Date(record.createdAt);
  const images: CookImage[] = record.images.map((img) => ({
    cid: getBlobCidString(img.image),
    mime: getBlobMime(img.image),
    alt: img.alt ?? null,
    aspectRatio: { width: img.aspectRatio.width, height: img.aspectRatio.height },
  }));

  return {
    uri,
    cid,
    authorDid,
    dishName: record.dishName,
    mealType: record.mealType,
    note: record.note ?? null,
    images: JSON.stringify(images),
    cookedAt: record.cookedAt,
    cookedAtUtc: new Date(record.cookedAt),
    cookedLocalDate: localDateOf(record.cookedAt),
    createdAt,
    indexedAt,
    // A backdated or future createdAt can't move a cook up the feed.
    sortAt: createdAt < indexedAt ? createdAt : indexedAt,
  };
}

// Idempotent: re-delivering the same record (same cid) changes nothing.
// A new cid (an update from another client) replaces the content but keeps
// indexedAt/sortAt, so edits can't bump a cook back to the top.
export async function upsertCook(
  db: Kysely<DatabaseSchema>,
  row: Insertable<CookTable>,
): Promise<void> {
  await db
    .insertInto("cook")
    .values(row)
    .onConflict((oc) =>
      oc
        .column("uri")
        .doUpdateSet((eb) => ({
          cid: eb.ref("excluded.cid"),
          dishName: eb.ref("excluded.dishName"),
          mealType: eb.ref("excluded.mealType"),
          note: eb.ref("excluded.note"),
          images: eb.ref("excluded.images"),
          cookedAt: eb.ref("excluded.cookedAt"),
          cookedAtUtc: eb.ref("excluded.cookedAtUtc"),
          cookedLocalDate: eb.ref("excluded.cookedLocalDate"),
          createdAt: eb.ref("excluded.createdAt"),
        }))
        .where((eb) => eb("cook.cid", "is distinct from", eb.ref("excluded.cid"))),
    )
    .execute();
}
