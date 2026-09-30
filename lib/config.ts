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

// Theme colors shared by the manifest, viewport, offline page and CSS
// (app/globals.css holds the full palette).
export const THEME = {
  light: { background: "#f8f6f1", foreground: "#211d18", muted: "#6e665b", accent: "#2f6b3f", accentForeground: "#ffffff" },
  dark: { background: "#151311", foreground: "#f3efe8", muted: "#a29a8e", accent: "#8cc596", accentForeground: "#10200f" },
  // Placeholder icons (scripts/gen-icons.ts) are replaced in Phase 7.
  accent: "#2f6b3f",
} as const;
