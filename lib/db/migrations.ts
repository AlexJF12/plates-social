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
};

export function getMigrator() {
  return new Migrator({
    db: getDb(),
    provider: { getMigrations: async () => migrations },
  });
}
