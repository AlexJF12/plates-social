import { getBlobCidString } from "@atproto/lex";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../db/schema";
import type { bskyProfile } from "../lexicons";

// Tap sends this when a DID's handle doesn't verify.
const INVALID_HANDLE = "handle.invalid";

// Makes sure an account row exists so feeds can join on it. Content from a
// DID with no identity event yet is shown (active defaults to true).
export async function ensureAccount(
  db: Kysely<DatabaseSchema>,
  did: string,
): Promise<void> {
  await db
    .insertInto("account")
    .values({ did })
    .onConflict((oc) => oc.column("did").doNothing())
    .execute();
}

// Identity event from Tap: handle and active status (§6.1). Tap verifies
// handles, so this is the only place a handle is written.
export async function upsertIdentity(
  db: Kysely<DatabaseSchema>,
  args: { did: string; handle: string; active: boolean },
): Promise<void> {
  const handle = args.handle === INVALID_HANDLE ? null : args.handle.toLowerCase();
  await db
    .insertInto("account")
    .values({ did: args.did, handle, active: args.active, updatedAt: new Date() })
    .onConflict((oc) =>
      oc
        .column("did")
        .doUpdateSet({ handle, active: args.active, updatedAt: new Date() })
        .where((eb) =>
          eb.or([
            eb("account.handle", "is distinct from", handle),
            eb("account.active", "!=", args.active),
          ]),
        ),
    )
    .execute();
}

// app.bsky.actor.profile (rkey "self"). A delete clears both fields.
export async function upsertProfile(
  db: Kysely<DatabaseSchema>,
  did: string,
  record: bskyProfile.Main | null,
): Promise<void> {
  const displayName = record?.displayName?.trim() || null;
  const avatarCid = record?.avatar ? getBlobCidString(record.avatar) : null;
  await db
    .insertInto("account")
    .values({ did, displayName, avatarCid, updatedAt: new Date() })
    .onConflict((oc) =>
      oc
        .column("did")
        .doUpdateSet({ displayName, avatarCid, updatedAt: new Date() })
        .where((eb) =>
          eb.or([
            eb("account.displayName", "is distinct from", displayName),
            eb("account.avatarCid", "is distinct from", avatarCid),
          ]),
        ),
    )
    .execute();
}

// A deleted account: remove everything it authored (§6.1). Other people's
// kudos, comments and follows pointing at it stay; they're hidden instead.
export async function purgeAccount(
  db: Kysely<DatabaseSchema>,
  did: string,
): Promise<void> {
  await db.deleteFrom("cook").where("authorDid", "=", did).execute();
  await db.deleteFrom("kudos").where("authorDid", "=", did).execute();
  await db.deleteFrom("comment").where("authorDid", "=", did).execute();
  await db.deleteFrom("follow").where("authorDid", "=", did).execute();
  await db.deleteFrom("account").where("did", "=", did).execute();
}
