import { cookies } from "next/headers";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { getOAuthClient } from "./client";
import { SESSION_COOKIE, decodeSessionCookie, getSessionSecret } from "./cookie";

// DID from a valid signed cookie. Doesn't touch the PDS.
export async function getDid(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeSessionCookie(
    cookieStore.get(SESSION_COOKIE)?.value,
    getSessionSecret(),
  );
}

// Full OAuth session (refreshing tokens if needed), or null if signed out or
// the session was revoked/expired server-side.
export async function getSession(): Promise<OAuthSession | null> {
  const did = await getDid();
  if (!did) return null;
  try {
    const client = await getOAuthClient();
    return await client.restore(did);
  } catch {
    return null;
  }
}
