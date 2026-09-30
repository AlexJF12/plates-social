import { Kysely, sql } from "kysely";
import { Migrator } from "kysely/migration";
import type { Migration } from "kysely/migration";
import { getDb } from ".";

// Migrations are additive (§0.13). Never edit one that has run anywhere
// shared; add a new one instead.
const migrations: Record<string, Migration> = {
  "001_auth": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("auth_state")
        .addColumn("key", "text", (col) => col.primaryKey())
        .addColumn("value", "text", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) =>
          col.notNull().defaultTo(sql`now()`),
        )
        .execute();

      await db.schema
        .createTable("auth_session")
        .addColumn("key", "text", (col) => col.primaryKey())
        .addColumn("value", "text", (col) => col.notNull())
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.notNull().defaultTo(sql`now()`),
        )
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("auth_session").execute();
      await db.schema.dropTable("auth_state").execute();
    },
  },

  // The index (§6.2). Every row is a copy of a record on someone's PDS and
  // can be rebuilt from Tap (§0.14). Keyed by record URI so Tap's
  // at-least-once delivery is idempotent. No foreign keys: Tap can deliver a
  // kudos before its cook, or a record before its author's identity event.
  "002_index": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("account")
        .addColumn("did", "text", (col) => col.primaryKey())
        .addColumn("handle", "text")
        .addColumn("displayName", "text")
        .addColumn("avatarCid", "text")
        .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.notNull().defaultTo(sql`now()`),
        )
        .execute();

      await db.schema
        .createTable("cook")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("cid", "text", (col) => col.notNull())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("dishName", "text", (col) => col.notNull())
        .addColumn("mealType", "text", (col) => col.notNull())
        .addColumn("note", "text")
        .addColumn("images", "jsonb", (col) => col.notNull())
        // Original string with the author's offset, e.g. 2026-09-29T19:30:00-04:00.
        .addColumn("cookedAt", "text", (col) => col.notNull())
        .addColumn("cookedAtUtc", "timestamptz", (col) => col.notNull())
        // Calendar date in the author's own offset (for stats, §6.4).
        .addColumn("cookedLocalDate", "date", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) => col.notNull())
        .addColumn("indexedAt", "timestamptz", (col) =>
          col.notNull().defaultTo(sql`now()`),
        )
        // min(createdAt, indexedAt): feed order can't be gamed by dates.
        .addColumn("sortAt", "timestamptz", (col) => col.notNull())
        .execute();
      // Global feed, cursor (sortAt, uri).
      await db.schema
        .createIndex("cook_sort_idx")
        .on("cook")
        .columns(["sortAt desc", "uri desc"])
        .execute();
      // Profile and following feeds.
      await db.schema
        .createIndex("cook_author_sort_idx")
        .on("cook")
        .columns(["authorDid", "sortAt desc", "uri desc"])
        .execute();
      // Stats (§6.4).
      await db.schema
        .createIndex("cook_author_local_date_idx")
        .on("cook")
        .columns(["authorDid", "cookedLocalDate"])
        .execute();

      await db.schema
        .createTable("kudos")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("subjectUri", "text", (col) => col.notNull())
        .addColumn("subjectCid", "text", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) => col.notNull())
        .addUniqueConstraint("kudos_author_subject_unique", [
          "authorDid",
          "subjectUri",
        ])
        .execute();
      await db.schema
        .createIndex("kudos_subject_idx")
        .on("kudos")
        .column("subjectUri")
        .execute();

      await db.schema
        .createTable("comment")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("subjectUri", "text", (col) => col.notNull())
        .addColumn("text", "text", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) => col.notNull())
        .addColumn("sortAt", "timestamptz", (col) => col.notNull())
        .execute();
      await db.schema
        .createIndex("comment_subject_sort_idx")
        .on("comment")
        .columns(["subjectUri", "sortAt", "uri"])
        .execute();
      // Purging a deleted account's rows.
      await db.schema
        .createIndex("comment_author_idx")
        .on("comment")
        .column("authorDid")
        .execute();

      await db.schema
        .createTable("follow")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("subjectDid", "text", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) => col.notNull())
        .addUniqueConstraint("follow_author_subject_unique", [
          "authorDid",
          "subjectDid",
        ])
        .execute();
    },
    async down(db: Kysely<unknown>) {
      for (const t of ["follow", "comment", "kudos", "cook", "account"]) {
        await db.schema.dropTable(t).execute();
      }
    },
  },

  // First sign-in per DID, so the Bluesky import is offered once (§6.3).
  // App state, not user content: not part of the rebuildable index, and
  // losing it only means the import screen is offered one more time.
  "003_login": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("login")
        .addColumn("did", "text", (col) => col.primaryKey())
        .addColumn("firstAt", "timestamptz", (col) =>
          col.notNull().defaultTo(sql`now()`),
        )
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("login").execute();
    },
  },

  // Search and best cook (Phase 6.6). Indexes only: results are computed
  // from the index on read, never stored.
  "004_search": {
    async up(db: Kysely<unknown>) {
      await sql`create extension if not exists pg_trgm`.execute(db);
      await sql`create extension if not exists unaccent`.execute(db);
      // unaccent() is only STABLE (its dictionary could change), so it can't
      // go in an index. This wrapper pins the dictionary and is IMMUTABLE,
      // the standard workaround. Search compares immutable_unaccent(column)
      // with immutable_unaccent(pattern), so "creme" finds "Crème brûlée".
      await sql`
        create or replace function immutable_unaccent(text) returns text
        language sql immutable parallel safe strict
        as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$
      `.execute(db);
      // Dish-name substring search (ILIKE '%…%').
      await sql`
        create index cook_dish_trgm_idx on cook
        using gin (immutable_unaccent("dishName") gin_trgm_ops)
      `.execute(db);
      // People search: display name and handle in one expression.
      await sql`
        create index account_name_trgm_idx on account
        using gin ((immutable_unaccent(coalesce("displayName", '') || ' ' || coalesce(handle, ''))) gin_trgm_ops)
      `.execute(db);
      // Best cook: every cook in a month, across authors.
      await db.schema.createIndex("cook_local_date_idx").on("cook").column("cookedLocalDate").execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropIndex("cook_local_date_idx").execute();
      await db.schema.dropIndex("account_name_trgm_idx").execute();
      await db.schema.dropIndex("cook_dish_trgm_idx").execute();
      await sql`drop function immutable_unaccent(text)`.execute(db);
    },
  },
};

export function getMigrator() {
  return new Migrator({
    db: getDb(),
    provider: { getMigrations: async () => migrations },
  });
}
