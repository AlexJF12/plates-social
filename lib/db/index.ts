import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DatabaseSchema } from "./schema";

let _db: Kysely<DatabaseSchema> | null = null;

export const getDb = (): Kysely<DatabaseSchema> => {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    _db = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
    });
  }
  return _db;
};

export type { DatabaseSchema } from "./schema";
