import {
  JoseKey,
  Keyset,
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
} from "@atproto/oauth-client-node";
import type {
  NodeSavedSession,
  NodeSavedState,
  OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import { APP_NAME, SCOPE } from "../config";
import { getDb } from "../db";

// Two client modes (as in the Statusphere example):
// - No PUBLIC_URL: atproto "loopback" client. No client metadata to host, but
//   the redirect must go to 127.0.0.1, so it only works on this machine.
// - PUBLIC_URL set (tunnel, later production): confidential client. The PDS
//   fetches our metadata from `${PUBLIC_URL}/oauth-client-metadata.json` and
//   we authenticate with PRIVATE_KEY. Needed for phone testing.
export const PUBLIC_URL = process.env.PUBLIC_URL || "http://127.0.0.1:3000";
const IS_LOOPBACK = !process.env.PUBLIC_URL;

let client: NodeOAuthClient | null = null;

function getClientMetadata(): OAuthClientMetadataInput {
  if (IS_LOOPBACK) {
    return buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
    });
  }
  return {
    client_id: `${PUBLIC_URL}/oauth-client-metadata.json`,
    client_name: APP_NAME,
    client_uri: PUBLIC_URL,
    redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: SCOPE,
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256", // must match scripts/gen-key.ts
    jwks_uri: `${PUBLIC_URL}/.well-known/jwks.json`,
    dpop_bound_access_tokens: true,
  };
}

async function getKeyset(): Promise<Keyset | undefined> {
  if (IS_LOOPBACK) return undefined;
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PUBLIC_URL is set but PRIVATE_KEY is not");
  return new Keyset([await JoseKey.fromJWK(JSON.parse(privateKey))]);
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;

  client = new NodeOAuthClient({
    clientMetadata: getClientMetadata(),
    keyset: await getKeyset(),

    stateStore: {
      async get(key: string) {
        const row = await getDb()
          .selectFrom("auth_state")
          .select("value")
          .where("key", "=", key)
          .executeTakeFirst();
        return row ? (JSON.parse(row.value) as NodeSavedState) : undefined;
      },
      async set(key: string, value: NodeSavedState) {
        const valueJson = JSON.stringify(value);
        await getDb()
          .insertInto("auth_state")
          .values({ key, value: valueJson })
          .onConflict((oc) =>
            oc.column("key").doUpdateSet({ value: valueJson }),
          )
          .execute();
      },
      async del(key: string) {
        await getDb().deleteFrom("auth_state").where("key", "=", key).execute();
      },
    },

    sessionStore: {
      async get(key: string) {
        const row = await getDb()
          .selectFrom("auth_session")
          .select("value")
          .where("key", "=", key)
          .executeTakeFirst();
        return row ? (JSON.parse(row.value) as NodeSavedSession) : undefined;
      },
      async set(key: string, value: NodeSavedSession) {
        const valueJson = JSON.stringify(value);
        await getDb()
          .insertInto("auth_session")
          .values({ key, value: valueJson, updatedAt: new Date() })
          .onConflict((oc) =>
            oc
              .column("key")
              .doUpdateSet({ value: valueJson, updatedAt: new Date() }),
          )
          .execute();
      },
      async del(key: string) {
        await getDb()
          .deleteFrom("auth_session")
          .where("key", "=", key)
          .execute();
      },
    },
  });

  return client;
}
