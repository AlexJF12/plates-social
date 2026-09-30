import { isValidDid } from "@atproto/syntax";
import { resolvePds } from "../pds";

// Bluesky import (§6.3): who the user follows on Bluesky, read from their
// app.bsky.graph.follow records with the public listRecords on their own
// PDS. No auth and no extra OAuth scope; these records are public.

const BSKY_FOLLOW = "app.bsky.graph.follow";
const PAGE_LIMIT = 100; // listRecords max
// 100 pages = 10,000 follows. Past that, the rest are ignored rather than
// keeping the request open for minutes.
const MAX_PAGES = 100;
const TIMEOUT_MS = 10_000;

export class PdsError extends Error {}

type ListRecordsPage = { cursor?: unknown; records?: { value?: { subject?: unknown } }[] };

// Followed DIDs, deduplicated, in PDS order. Records are untrusted: anything
// whose subject isn't a valid DID is skipped.
export async function listBskyFollows(
  did: string,
  opts: { pds?: URL; fetch?: typeof fetch } = {},
): Promise<string[]> {
  const pds = opts.pds ?? (await resolvePds(did));
  if (!pds) throw new PdsError(`no usable PDS for ${did}`);
  const doFetch = opts.fetch ?? fetch;

  const dids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", BSKY_FOLLOW);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    let body: ListRecordsPage;
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
      if (!res.ok) throw new PdsError(`listRecords ${res.status}`);
      body = await res.json();
    } catch (err) {
      if (err instanceof PdsError) throw err;
      throw new PdsError(`listRecords failed: ${err instanceof Error ? err.message : err}`);
    }

    for (const r of Array.isArray(body.records) ? body.records : []) {
      const subject = r?.value?.subject;
      if (typeof subject === "string" && isValidDid(subject)) dids.add(subject);
    }
    // A PDS that repeats its cursor would loop until MAX_PAGES; stop early.
    const next = typeof body.cursor === "string" && body.cursor ? body.cursor : undefined;
    if (!next || next === cursor || !body.records?.length) break;
    cursor = next;
  }
  return [...dids];
}
