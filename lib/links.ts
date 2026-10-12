import type { Author } from "./db/queries";

// Client-safe helpers for linking to people and cooks.

// Handle when known (readable), DID otherwise. /profile/[actor] takes both.
export const profilePath = (a: Pick<Author, "did" | "handle">) =>
  `/profile/${a.handle ?? a.did}`;

export const cookPath = (did: string, rkey: string) => `/cook/${did}/${rkey}`;

export const displayName = (a: Pick<Author, "did" | "handle" | "displayName">) =>
  a.displayName || a.handle || a.did;

// A same-origin path to return to after sign-in (`?next=`, OAuth state), or
// null. Rejects anything that could leave the site ("//host", "/\host",
// absolute URLs) and oversized values.
export function safeNext(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 512) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\s\\]/.test(v)) return null;
  return v;
}
