import { isValidDid } from "@atproto/syntax";

// DENYLIST_DIDS (§7): accounts hidden everywhere, without a code deploy
// (changing the env var restarts the app). Applied when reading, not when
// indexing, so removing a DID brings its content straight back. DIDs are
// separated by commas and/or whitespace; anything else is ignored.

let cached: { raw: string; dids: string[] } | null = null;

export function denylist(): string[] {
  const raw = process.env.DENYLIST_DIDS ?? "";
  if (cached?.raw !== raw) {
    const entries = raw.split(/[\s,]+/).filter(Boolean);
    const invalid = entries.filter((d) => !isValidDid(d));
    if (invalid.length) console.warn(`DENYLIST_DIDS: ignoring invalid DIDs: ${invalid.join(", ")}`);
    cached = { raw, dids: entries.filter((d) => isValidDid(d)) };
  }
  return cached.dids;
}
