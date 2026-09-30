import { isValidDid, isValidHandle } from "@atproto/syntax";
import { type Kysely, sql } from "kysely";
import { COLLECTIONS } from "../config";
import { type Badge, isCompletedMonth, type Month, monthRange } from "../cook/best";
import { MEAL_TYPES } from "../cook/mealTypes";
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
  // Best cook of a completed month (Phase 6.6), or null.
  badge: Badge | null;
  // The signed-in viewer has given this cook kudos (Phase 6.7).
  viewerKudos: boolean;
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

// Every cook read goes through here. `viewer` (a DID, or null) fills
// viewerKudos in the same query: an exists subquery, not a request per card.
function cookQuery(db: Db, viewer: string | null = null) {
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
      viewer
        ? eb
            .exists(
              eb
                .selectFrom("kudos")
                .innerJoin("account as va", "va.did", "kudos.authorDid")
                .where(visibleAccount("va"))
                .where("kudos.authorDid", "=", viewer)
                .whereRef("kudos.subjectUri", "=", "cook.uri")
                .select(sql`1`.as("one")),
            )
            .as("viewerKudos")
        : sql<boolean>`false`.as("viewerKudos"),
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
  badge: null,
  viewerKudos: Boolean(r.viewerKudos),
});

// Newest first, PAGE_SIZE at a time, by the (sortAt, uri) cursor, with
// badges looked up for the whole page in one query.
async function cookPage(db: Db, q: ReturnType<typeof cookQuery>, cursor?: string | null): Promise<FeedPage> {
  q = q.orderBy("cook.sortAt", "desc").orderBy("cook.uri", "desc").limit(PAGE_SIZE + 1);
  const after = cursor ? decodeCursor(cursor) : null;
  if (after) {
    q = q.where((eb) =>
      eb(eb.refTuple("cook.sortAt", "cook.uri"), "<", eb.tuple(after.sortAt, after.uri)),
    );
  }
  const rows = await q.execute();
  const items = await withBadges(db, rows.slice(0, PAGE_SIZE).map(toView));
  return {
    items,
    cursor: rows.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null,
  };
}

// Newest first. With authorDid: one person's cooks (profile). With
// followedBy: cooks from the people that DID follows in this app, plus its
// own (following feed). Neither: every indexed cook (global feed).
export async function getCookFeed(opts: {
  authorDid?: string;
  followedBy?: string;
  viewer?: string | null;
  cursor?: string | null;
  db?: Db;
}): Promise<FeedPage> {
  const db = opts.db ?? getDb();
  let q = cookQuery(db, opts.viewer);
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
  return cookPage(db, q, opts.cursor);
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

export async function getCookDetail(did: string, rkey: string, db: Db = getDb(), viewer: string | null = null) {
  const uri = cookUriOf(did, rkey);
  const row = await cookQuery(db, viewer).where("cook.uri", "=", uri).executeTakeFirst();
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

  const [cook] = await withBadges(db, [toView(row)]);
  return { cook, kudos: kudos satisfies Author[], comments };
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

// ---- Best cook (Phase 6.6) ----

export type BestCook = { uri: string; authorDid: string; mealType: string; month: Month; score: number };

// The winner per (month, meal type) for the given months, computed from
// the index on every read. Score = distinct kudos authors, not counting
// the cook's own author or hidden accounts; only visible cooks compete,
// only the six known meal types, and a winner needs at least 1 kudos (the
// inner join). Ties: earliest cookedAt, then lowest uri. With authorDid,
// only that author's wins (they still competed against everyone).
export async function getBestCooks(opts: { months: Month[]; authorDid?: string; db?: Db }): Promise<BestCook[]> {
  const months = [...new Set(opts.months)].sort();
  if (months.length === 0) return [];
  const db = opts.db ?? getDb();
  const from = monthRange(months[0]).from;
  const to = monthRange(months[months.length - 1]).to;
  const { rows } = await sql<BestCook>`
    select * from (
      select distinct on (month, c."mealType")
        c.uri, c."authorDid", c."mealType",
        to_char(c."cookedLocalDate", 'YYYY-MM') as month,
        count(distinct k."authorDid")::int as score
      from cook c
      join account a on a.did = c."authorDid"
      join kudos k on k."subjectUri" = c.uri and k."authorDid" <> c."authorDid"
      join account ka on ka.did = k."authorDid"
      where ${visibleAccount("a")} and ${visibleAccount("ka")}
        and c."cookedLocalDate" >= ${from}::date and c."cookedLocalDate" < ${to}::date
        and to_char(c."cookedLocalDate", 'YYYY-MM') = any(${months}::text[])
        and c."mealType" = any(${MEAL_TYPES.map((m) => m.value)}::text[])
      group by c.uri
      order by month, c."mealType", score desc, c."cookedAtUtc" asc, c.uri asc
    ) w
    where ${opts.authorDid ? sql`w."authorDid" = ${opts.authorDid}` : sql`true`}
    order by month desc, w."mealType"
  `.execute(db);
  return rows;
}

// Sets `badge` on cooks that won a completed month. One query per page.
async function withBadges(db: Db, cooks: CookView[], now = new Date()): Promise<CookView[]> {
  const months = cooks.map((c) => c.cookedAt.slice(0, 7)).filter((m) => isCompletedMonth(m, now));
  if (months.length === 0) return cooks;
  const wins = new Map((await getBestCooks({ months, db })).map((w) => [w.uri, w]));
  return cooks.map((c) => {
    const w = wins.get(c.uri);
    return w ? { ...c, badge: { mealType: w.mealType, month: w.month } } : c;
  });
}

// A profile's wins in completed months, newest first.
export async function getAuthorBadges(did: string, db: Db = getDb(), now = new Date()): Promise<(Badge & { uri: string })[]> {
  const rows = await db
    .selectFrom("cook")
    .where("authorDid", "=", did)
    .where((eb) => eb.exists(eb.selectFrom("kudos").select(sql`1`.as("one")).whereRef("kudos.subjectUri", "=", "cook.uri")))
    .select(sql<string>`to_char("cookedLocalDate", 'YYYY-MM')`.as("month"))
    .distinct()
    .execute();
  const months = rows.map((r) => r.month).filter((m) => isCompletedMonth(m, now));
  const wins = await getBestCooks({ months, authorDid: did, db });
  const order = (t: string) => MEAL_TYPES.findIndex((m) => m.value === t);
  return wins
    .sort((a, b) => b.month.localeCompare(a.month) || order(a.mealType) - order(b.mealType))
    .map(({ uri, mealType, month }) => ({ uri, mealType, month }));
}

export type BestOfMonth = { mealType: string; cook: CookView | null; score: number }[];

// The Best tab: one entry per known meal type, in the log form's order.
export async function getBestOfMonth(month: Month, db: Db = getDb()): Promise<BestOfMonth> {
  const wins = await getBestCooks({ months: [month], db });
  const cooks = wins.length
    ? (await cookQuery(db).where("cook.uri", "in", wins.map((w) => w.uri)).execute()).map(toView)
    : [];
  return MEAL_TYPES.map(({ value }) => {
    const w = wins.find((x) => x.mealType === value);
    return { mealType: value, cook: cooks.find((c) => c.uri === w?.uri) ?? null, score: w?.score ?? 0 };
  });
}

// The earliest month with any visible cook (the Best tab's Previous stops
// there), or null if there are none.
export async function getEarliestCookMonth(db: Db = getDb()): Promise<Month | null> {
  const row = await db
    .selectFrom("cook")
    .innerJoin("account", "account.did", "cook.authorDid")
    .where(visibleAccount("account"))
    .select(sql<string | null>`to_char(min("cookedLocalDate"), 'YYYY-MM')`.as("month"))
    .executeTakeFirst();
  return row?.month ?? null;
}

// ---- Search (Phase 6.6) ----

// A LIKE pattern matching `q` anywhere, with its own %, _ and \ literal.
export const containsPattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// Dish names containing q, case- and accent-insensitive (the trigram index
// on immutable_unaccent("dishName")), newest first, paged like the feeds.
// `q` must already be normalized (lib/search.ts).
export async function searchCooks(opts: {
  q: string;
  mealType?: string | null;
  viewer?: string | null;
  cursor?: string | null;
  db?: Db;
}): Promise<FeedPage> {
  const db = opts.db ?? getDb();
  let q = cookQuery(db, opts.viewer).where(
    sql<boolean>`immutable_unaccent(cook."dishName") ilike immutable_unaccent(${containsPattern(opts.q)})`,
  );
  if (opts.mealType) q = q.where("cook.mealType", "=", opts.mealType);
  return cookPage(db, q, opts.cursor);
}

// Visible accounts whose display name or handle contains q, at most 5;
// names that start with q first.
export async function searchPeople(q: string, db: Db = getDb()): Promise<Author[]> {
  const name = sql<string>`immutable_unaccent(coalesce("displayName", '') || ' ' || coalesce(handle, ''))`;
  const prefix = q.replace(/[\\%_]/g, "\\$&") + "%";
  return db
    .selectFrom("account")
    .select(["did", "handle", "displayName", "avatarCid"])
    .where(visibleAccount("account"))
    .where(sql<boolean>`${name} ilike immutable_unaccent(${containsPattern(q)})`)
    .orderBy(
      sql`(immutable_unaccent(coalesce("displayName", '')) ilike immutable_unaccent(${prefix}) or handle ilike ${prefix})`,
      "desc",
    )
    .orderBy(sql`lower(coalesce("displayName", handle, did))`)
    .limit(5)
    .execute();
}
