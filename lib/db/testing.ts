import type { Kysely } from "kysely";
import { getDb } from ".";
import type { DatabaseSchema } from "./schema";

// For tests that need real SQL: they run against the local Postgres
// (pnpm db:up && pnpm migrate) inside a transaction that is always rolled
// back, so they never leave rows behind.
if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");

class Rollback extends Error {}

export async function inRollback(fn: (db: Kysely<DatabaseSchema>) => Promise<void>) {
  await getDb()
    .transaction()
    .execute(async (trx) => {
      await fn(trx);
      throw new Rollback();
    })
    .catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
}
