import type { Author } from "./db/queries";

// Client-safe helpers for linking to people and cooks.

// Handle when known (readable), DID otherwise. /profile/[actor] takes both.
export const profilePath = (a: Pick<Author, "did" | "handle">) =>
  `/profile/${a.handle ?? a.did}`;

export const cookPath = (did: string, rkey: string) => `/cook/${did}/${rkey}`;

export const displayName = (a: Pick<Author, "did" | "handle" | "displayName">) =>
  a.displayName || a.handle || a.did;
