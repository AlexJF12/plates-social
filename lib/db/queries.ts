import { isValidDid, isValidHandle } from "@atproto/syntax";
import { type Kysely, sql } from "kysely";
import { COLLECTIONS } from "../config";
import type { DayCount } from "../cook/stats";
import { denylist } from "../denylist";
import { getDb } from ".";
import type { CookImage, DatabaseSchema } from "./schema";

type Db = Kysely<DatabaseSchema>;

// Read side of the index. Pages read only from here (§3). Content from
// inactive accounts (takendown, suspended, deactivated) and denylisted
// ones is hidden everywhere: every query joins `account` and requires
// visibleAccount.

export const PAGE_SIZE = 20;

// The account (table or alias) is active and not on DENYLIST_DIDS.
export const visibleAccount = (table: string) =>
  sql<boolean>`${sql.ref(`${table}.active`)} and not (${sql.ref(`${table}.did`)} = any(${denylist()}::text[]))`;

export type Author = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarCid: string | null;
};

// Plain JSON so it can cross to client components and the feed API.
export type CookView = {
  uri: string;
  rkey: string;
  author: Author;
  dishName: string;
  mealType: string;
  note: string | null;
  images: CookImage[];
  cookedAt: string;
  sortAt: string;
  kudosCount: number;
  commentCount: number;
};

export type FeedPage = { items: CookView[]; cursor: string | null };

// Cursor = sortAt + uri of the last item (§6.2). The ISO date has no "~".
const encodeCursor = (c: { sortAt: string; uri: string }) => `${c.sortAt}~${c.uri}`;
function decodeCursor(cursor: string): { sortAt: Date; uri: string } | null {
  const i = cursor.indexOf("~");
  if (i < 0) return null;
  const sortAt = new Date(cursor.slice(0, i));
  if (Number.isNaN(sortAt.getTime())) return null;
  return { sortAt, uri: cursor.slice(i + 1) };
}

const rkeyOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

function cookQuery(db: Db) {
  return db
    .selectFrom("cook")
    .innerJoin("account", "account.did", "cook.authorDid")
    .where(visibleAccount("account"))
    .select((eb) => [
      "cook.uri",
      "cook.dishName",
      "cook.mealType",
      "cook.note",
      "cook.images",
      "cook.cookedAt",
      "cook.sortAt",
      "account.did",
      "account.handle",
      "account.displayName",
      "account.avatarCid",
      eb
        .selectFrom("kudos")
        .innerJoin("account as ka", "ka.did", "kudos.authorDid")
        .where(visibleAccount("ka"))
        .whereRef("kudos.subjectUri", "=", "cook.uri")
        .select(sql<number>`count(*)::int`.as("n"))
        .as("kudosCount"),
      eb
        .selectFrom("comment")
        .innerJoin("account as ca", "ca.did", "comment.authorDid")
        .where(visibleAccount("ca"))
        .whereRef("comment.subjectUri", "=", "cook.uri")
        .select(sql<number>`count(*)::int`.as("n"))
        .as("commentCount"),
    ]);
}

type CookRow = Awaited<ReturnType<ReturnType<typeof cookQuery>["executeTakeFirstOrThrow"]>>;

const toView = (r: CookRow): CookView => ({
  uri: r.uri,
  rkey: rkeyOf(r.uri),
  author: { did: r.did, handle: r.handle, displayName: r.displayName, avatarCid: r.avatarCid },
  dishName: r.dishName,
  mealType: r.mealType,
  note: r.note,
  images: r.images,
  cookedAt: r.cookedAt,
  sortAt: r.sortAt.toISOString(),
  kudosCount: r.kudosCount ?? 0,
  commentCount: r.commentCount ?? 0,
});

// Newest first. With authorDid: one person's cooks (profile). With
// followedBy: cooks from the people that DID follows in this app, plus its
// own (following feed). Neither: every indexed cook (global feed).
export async function getCookFeed(opts: {
  authorDid?: string;
  followedBy?: string;
  cursor?: string | null;
  db?: Db;
}): Promise<FeedPage> {
  let q = cookQuery(opts.db ?? getDb())
    .orderBy("cook.sortAt", "desc")
    .orderBy("cook.uri", "desc")
    .limit(PAGE_SIZE + 1);
  if (opts.authorDid) q = q.where("cook.authorDid", "=", opts.authorDid);
  const me = opts.followedBy;
  if (me) {
    q = q.where((eb) =>
      eb.or([
        eb("cook.authorDid", "=", me),
        eb(
          "cook.authorDid",
          "in",
          eb.selectFrom("follow").select("follow.subjectDid").where("follow.authorDid", "=", me),
        ),
      ]),
    );
  }
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (after) {
    q = q.where((eb) =>
      eb(eb.refTuple("cook.sortAt", "cook.uri"), "<", eb.tuple(after.sortAt, after.uri)),
    );
  }
  const rows = await q.execute();
  const items = rows.slice(0, PAGE_SIZE).map(toView);
  return {
    items,
    cursor: rows.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null,
  };
}

// A profile by DID or handle, or null if unknown or hidden.
export async function getAccount(actor: string, db: Db = getDb()): Promise<Author | null> {
  const did = isValidDid(actor);
  if (!did && !isValidHandle(actor)) return null;
  const row = await db
    .selectFrom("account")
    .select(["did", "handle", "displayName", "avatarCid"])
    .where(visibleAccount("account"))
    .where(did ? "did" : "handle", "=", did ? actor : actor.toLowerCase())
    // A stale row can still hold a handle that has moved to another DID.
    .orderBy("updatedAt", "desc")
    .executeTakeFirst();
  return row ?? null;
}

export type CommentView = {
  uri: string;
  author: Author;
  text: string;
  sortAt: string;
};

export type CommentPage = { items: CommentView[]; cursor: string | null };

const authorCols = ["account.did", "account.handle", "account.displayName", "account.avatarCid"] as const;

export const cookUriOf = (did: string, rkey: string) => `at://${did}/${COLLECTIONS.cook}/${rkey}`;

// A cook's comments, oldest first, 20 per page (§6.2). Comments on a cook
// that is gone or hidden aren't shown (§6.2), but their rows are kept: the
// cook may come back (e.g. its author is reactivated).
export async function getComments(opts: {
  cookUri: string;
  cursor?: string | null;
  db?: Db;
}): Promise<CommentPage> {
  const db = opts.db ?? getDb();
  let q = db
    .selectFrom("comment")
    .innerJoin("account", "account.did", "comment.authorDid")
    .where(visibleAccount("account"))
    .where("comment.subjectUri", "=", opts.cookUri)
    .where((eb) => eb.exists(cookQuery(db).where("cook.uri", "=", opts.cookUri)))
    .select([...authorCols, "comment.uri", "comment.text", "comment.sortAt"])
    .orderBy("comment.sortAt", "asc")
    .orderBy("comment.uri", "asc")
    .limit(PAGE_SIZE + 1);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (after) {
    q = q.where((eb) =>
      eb(eb.refTuple("comment.sortAt", "comment.uri"), ">", eb.tuple(after.sortAt, after.uri)),
    );
  }
  const rows = await q.execute();
  const items = rows.slice(0, PAGE_SIZE).map(
    (c): CommentView => ({
      uri: c.uri,
      author: { did: c.did, handle: c.handle, displayName: c.displayName, avatarCid: c.avatarCid },
      text: c.text,
      sortAt: c.sortAt.toISOString(),
    }),
  );
  return {
    items,
    cursor: rows.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null,
  };
}

// The visible cook at uri (uri + cid for a strongRef), or null.
export async function getVisibleCook(uri: string, db: Db = getDb()) {
  return (
    (await db
      .selectFrom("cook")
      .innerJoin("account", "account.did", "cook.authorDid")
      .where(visibleAccount("account"))
      .where("cook.uri", "=", uri)
      .select(["cook.uri", "cook.cid", "cook.authorDid"])
      .executeTakeFirst()) ?? null
  );
}

export async function getCookDetail(did: string, rkey: string, db: Db = getDb()) {
  const uri = cookUriOf(did, rkey);
  const row = await cookQuery(db).where("cook.uri", "=", uri).executeTakeFirst();
  if (!row) return null;

  const [kudos, comments] = await Promise.all([
    db
      .selectFrom("kudos")
      .innerJoin("account", "account.did", "kudos.authorDid")
      .where(visibleAccount("account"))
      .where("kudos.subjectUri", "=", uri)
      .select(authorCols)
      .orderBy("kudos.createdAt", "asc")
      .execute(),
    getComments({ cookUri: uri, db }),
  ]);

  return { cook: toView(row), kudos: kudos satisfies Author[], comments };
}

// The viewer's kudos record for a cook, if any.
export async function getKudosUri(viewer: string, cookUri: string, db: Db = getDb()) {
  const row = await db
    .selectFrom("kudos")
    .select("uri")
    .where("authorDid", "=", viewer)
    .where("subjectUri", "=", cookUri)
    .executeTakeFirst();
  return row?.uri ?? null;
}

// The viewer's follow record for subject, if any (profile follow button).
export async function getFollowUri(viewer: string, subject: string, db: Db = getDb()) {
  const row = await db
    .selectFrom("follow")
    .select("uri")
    .where("authorDid", "=", viewer)
    .where("subjectDid", "=", subject)
    .executeTakeFirst();
  return row?.uri ?? null;
}

// Bluesky import (§6.3): of the given DIDs, the visible accounts with at
// least one indexed cook that the viewer doesn't already follow here.
export async function getImportCandidates(
  viewer: string,
  dids: string[],
  db: Db = getDb(),
): Promise<Author[]> {
  if (dids.length === 0) return [];
  return db
    .selectFrom("account")
    .select(["did", "handle", "displayName", "avatarCid"])
    .where(visibleAccount("account"))
    // One array parameter, however many follows (IN would need one each).
    .where(sql<boolean>`did = any(${dids}::text[])`)
    .where("did", "!=", viewer)
    .where((eb) =>
      eb.exists(eb.selectFrom("cook").select(sql`1`.as("one")).whereRef("cook.authorDid", "=", "account.did")),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("follow")
            .select(sql`1`.as("one"))
            .where("follow.authorDid", "=", viewer)
            .whereRef("follow.subjectDid", "=", "account.did"),
        ),
      ),
    )
    .orderBy(sql`lower(coalesce("displayName", handle, did))`)
    .execute();
}

// Cooks per local day (cookedLocalDate) in [from, to], for profile stats
// (§6.4). The browser buckets these into its own week and month.
export async function getCookDayCounts(
  did: string,
  window: { from: string; to: string },
  db: Db = getDb(),
): Promise<DayCount[]> {
  return db
    .selectFrom("cook")
    .innerJoin("account", "account.did", "cook.authorDid")
    .where(visibleAccount("account"))
    .where("cook.authorDid", "=", did)
    .where("cook.cookedLocalDate", ">=", window.from)
    .where("cook.cookedLocalDate", "<=", window.to)
    .select(["cook.cookedLocalDate as date", sql<number>`count(*)::int`.as("count")])
    .groupBy("cook.cookedLocalDate")
    .orderBy("cook.cookedLocalDate")
    .execute();
}
