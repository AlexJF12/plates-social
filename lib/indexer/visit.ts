import { getBlobCidString, getBlobMime } from "@atproto/lex";
import type { Insertable, Kysely } from "kysely";
import type { visit } from "../lexicons";
import { localDateOf } from "../cook/datetime";
import type { CookImage, DatabaseSchema, VisitTable } from "../db/schema";

// Record -> `visit` row, shared by the read-your-own-writes upsert and the
// Tap webhook. The record must already have passed visit.$parse.
export function visitRow(args: {
  uri: string;
  cid: string;
  authorDid: string;
  record: visit.Main;
  indexedAt?: Date;
}): Insertable<VisitTable> {
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
    restaurantName: record.restaurant.name,
    // Another client could write "" for "no area": store it as none.
    restaurantArea: record.restaurant.area || null,
    rating: record.rating,
    review: record.review ?? null,
    mealType: record.mealType,
    images: JSON.stringify(images),
    visitedAt: record.visitedAt,
    visitedAtUtc: new Date(record.visitedAt),
    visitedLocalDate: localDateOf(record.visitedAt),
    createdAt,
    indexedAt,
    sortAt: createdAt < indexedAt ? createdAt : indexedAt,
  };
}

// Idempotent, like upsertCook: the same cid changes nothing, a new cid
// replaces the content but keeps indexedAt/sortAt.
export async function upsertVisit(
  db: Kysely<DatabaseSchema>,
  row: Insertable<VisitTable>,
): Promise<void> {
  await db
    .insertInto("visit")
    .values(row)
    .onConflict((oc) =>
      oc
        .column("uri")
        .doUpdateSet((eb) => ({
          cid: eb.ref("excluded.cid"),
          restaurantName: eb.ref("excluded.restaurantName"),
          restaurantArea: eb.ref("excluded.restaurantArea"),
          rating: eb.ref("excluded.rating"),
          review: eb.ref("excluded.review"),
          mealType: eb.ref("excluded.mealType"),
          images: eb.ref("excluded.images"),
          visitedAt: eb.ref("excluded.visitedAt"),
          visitedAtUtc: eb.ref("excluded.visitedAtUtc"),
          visitedLocalDate: eb.ref("excluded.visitedLocalDate"),
          createdAt: eb.ref("excluded.createdAt"),
        }))
        .where((eb) => eb("visit.cid", "is distinct from", eb.ref("excluded.cid"))),
    )
    .execute();
}
