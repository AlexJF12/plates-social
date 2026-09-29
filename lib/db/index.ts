import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import type { DatabaseSchema } from "./schema";

// Return `date` columns as 'YYYY-MM-DD' strings. pg's default turns them into
// a Date at server-local midnight, which shifts cookedLocalDate by the
// server's time zone.
const DATE_OID = 1082;
const pgTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === DATE_OID
      ? (v: string) => v
      : types.getTypeParser(oid, format as "text")) as typeof types.getTypeParser,
};

let _db: Kysely<DatabaseSchema> | null = null;

export const getDb = (): Kysely<DatabaseSchema> => {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    _db = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString, types: pgTypes }) }),
    });
  }
  return _db;
};

export type { DatabaseSchema } from "./schema";
