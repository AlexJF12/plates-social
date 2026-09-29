import type { ColumnType } from "kysely";

// Postgres returns timestamptz as Date; inserts may omit defaulted columns.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface DatabaseSchema {
  auth_state: AuthStateTable;
  auth_session: AuthSessionTable;
}

// OAuth client state (in-flight authorization requests). Auth tables are the
// only non-rebuildable data in Postgres (§0.14).
export interface AuthStateTable {
  key: string;
  value: string;
  createdAt: Timestamp;
}

// OAuth sessions (tokens + DPoP key), keyed by DID.
export interface AuthSessionTable {
  key: string;
  value: string;
  updatedAt: Timestamp;
}
