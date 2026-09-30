import { isValidDid, isValidHandle } from "@atproto/syntax";
import { type Kysely, sql } from "kysely";
import { COLLECTIONS } from "../config";
import { getDb } from ".";
import type { CookImage, DatabaseSchema } from "./schema";

type Db = Kysely<DatabaseSchema>;

// Read side of the index. Pages read only from here (§3). Content from
// inactive accounts (takendown, suspended, deactivated) is hidden
// everywhere: every query joins `account` and requires active.

export const PAGE_SIZE = 20;

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
const encodeCursor = (c: CookView) => `${c.sortAt}~${c.uri}`;
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
    .where("account.active", "=", true)
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
        .where("ka.active", "=", true)
        .whereRef("kudos.subjectUri", "=", "cook.uri")
        .select(sql<number>`count(*)::int`.as("n"))
        .as("kudosCount"),
      eb
        .selectFrom("comment")
        .innerJoin("account as ca", "ca.did", "comment.authorDid")
        .where("ca.active", "=", true)
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

// Newest first. With authorDid: one person's cooks (profile); without:
// every indexed cook (global feed).
export async function getCookFeed(opts: {
  authorDid?: string;
  cursor?: string | null;
  db?: Db;
}): Promise<FeedPage> {
  let q = cookQuery(opts.db ?? getDb())
    .orderBy("cook.sortAt", "desc")
    .orderBy("cook.uri", "desc")
    .limit(PAGE_SIZE + 1);
  if (opts.authorDid) q = q.where("cook.authorDid", "=", opts.authorDid);
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
    .where("active", "=", true)
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

// Phase 3 shows up to this many comments; paging arrives with posting
// comments in Phase 5.
const COMMENT_LIMIT = 50;

export async function getCookDetail(did: string, rkey: string, db: Db = getDb()) {
  const uri = `at://${did}/${COLLECTIONS.cook}/${rkey}`;
  const row = await cookQuery(db).where("cook.uri", "=", uri).executeTakeFirst();
  if (!row) return null;

  const authorCols = ["account.did", "account.handle", "account.displayName", "account.avatarCid"] as const;
  const [kudos, comments] = await Promise.all([
    db
      .selectFrom("kudos")
      .innerJoin("account", "account.did", "kudos.authorDid")
      .where("account.active", "=", true)
      .where("kudos.subjectUri", "=", uri)
      .select(authorCols)
      .orderBy("kudos.createdAt", "asc")
      .execute(),
    db
      .selectFrom("comment")
      .innerJoin("account", "account.did", "comment.authorDid")
      .where("account.active", "=", true)
      .where("comment.subjectUri", "=", uri)
      .select([...authorCols, "comment.uri", "comment.text", "comment.sortAt"])
      .orderBy("comment.sortAt", "asc")
      .orderBy("comment.uri", "asc")
      .limit(COMMENT_LIMIT)
      .execute(),
  ]);

  return {
    cook: toView(row),
    kudos: kudos satisfies Author[],
    comments: comments.map(
      (c): CommentView => ({
        uri: c.uri,
        author: { did: c.did, handle: c.handle, displayName: c.displayName, avatarCid: c.avatarCid },
        text: c.text,
        sortAt: c.sortAt.toISOString(),
      }),
    ),
  };
}
