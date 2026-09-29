import { createHmac, timingSafeEqual } from "node:crypto";

// The session cookie holds `<did>.<hmac>`. Statusphere stores the bare DID,
// which anyone can forge by setting the cookie themselves; the HMAC stops that.
// The OAuth tokens themselves stay server-side in auth_session.

export const SESSION_COOKIE = "session";

// Long-lived (§7.1): iOS home-screen apps have their own cookie jar, so a
// sign-out here means a full OAuth round trip. Token refresh is handled by
// the OAuth client on restore().
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

function sign(did: string, secret: string): string {
  return createHmac("sha256", secret).update(did).digest("base64url");
}

export function encodeSessionCookie(did: string, secret: string): string {
  return `${did}.${sign(did, secret)}`;
}

export function decodeSessionCookie(
  value: string | undefined,
  secret: string,
): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const did = value.slice(0, dot);
  if (!did.startsWith("did:")) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(did, secret));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? did : null;
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (at least 32 chars)");
  }
  return secret;
}
