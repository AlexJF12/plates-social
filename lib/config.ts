// The Lexicon namespace. Every record users write is stamped with it, so the
// real value is permanent. Never publish Lexicons while this starts with
// `com.example`. Renaming = change this, regenerate lexicon code, edit
// lib/lexicons.ts.
export const NS = "com.example.cooklog";

export const APP_NAME = "Cooklog";

export const COLLECTIONS = {
  cook: `${NS}.cook`,
  kudos: `${NS}.kudos`,
  comment: `${NS}.comment`,
  follow: `${NS}.follow`,
} as const;

// Granular scopes only (§5). Never `transition:generic`, never app.bsky.*.
export const SCOPE = [
  "atproto",
  `repo:${COLLECTIONS.cook}`,
  `repo:${COLLECTIONS.kudos}`,
  `repo:${COLLECTIONS.comment}`,
  `repo:${COLLECTIONS.follow}`,
  "blob:image/*",
].join(" ");

// Theme colors shared by the manifest, viewport and CSS.
export const THEME = {
  light: { background: "#fafaf9", foreground: "#1c1917" },
  dark: { background: "#0c0a09", foreground: "#f5f5f4" },
  accent: "#e8590c",
} as const;
