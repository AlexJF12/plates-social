import type { ColumnType } from "kysely";

// Postgres returns timestamptz as Date; inserts may omit defaulted columns.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface DatabaseSchema {
  auth_state: AuthStateTable;
  auth_session: AuthSessionTable;
  account: AccountTable;
  cook: CookTable;
  kudos: KudosTable;
  comment: CommentTable;
  follow: FollowTable;
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

// ---- Index tables (§6.2): rebuildable copies of PDS records. ----

// A `date` column, kept as 'YYYY-MM-DD' (see the type parser in ./index.ts).
type DateString = ColumnType<string, string, string>;

export interface AccountTable {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarCid: string | null;
  active: ColumnType<boolean, boolean | undefined, boolean>;
  updatedAt: Timestamp;
}

export interface CookImage {
  cid: string;
  mime: string;
  alt: string | null;
  aspectRatio: { width: number; height: number };
}

export interface CookTable {
  uri: string;
  cid: string;
  authorDid: string;
  dishName: string;
  mealType: string;
  note: string | null;
  // pg serialises JS arrays as Postgres arrays, so write JSON.stringify(images).
  images: ColumnType<CookImage[], string, string>;
  cookedAt: string;
  cookedAtUtc: Timestamp;
  cookedLocalDate: DateString;
  createdAt: Timestamp;
  indexedAt: Timestamp;
  sortAt: Timestamp;
}

export interface KudosTable {
  uri: string;
  authorDid: string;
  subjectUri: string;
  subjectCid: string;
  createdAt: Timestamp;
}

export interface CommentTable {
  uri: string;
  authorDid: string;
  subjectUri: string;
  text: string;
  createdAt: Timestamp;
  sortAt: Timestamp;
}

export interface FollowTable {
  uri: string;
  authorDid: string;
  subjectDid: string;
  createdAt: Timestamp;
}
