import { describe, expect, it } from "vitest";
import { listBskyFollows, PdsError } from "./bluesky";

const ME = "did:plc:testme000000000000000000";
const PDS = new URL("https://pds.example.com");
const did = (i: number) => `did:plc:follow${String(i).padStart(19, "0")}`;

// A fake PDS serving `pages` as listRecords responses, keyed by cursor.
function fakePds(pages: Record<string, { cursor?: string; records: unknown[] }>) {
  const calls: URL[] = [];
  const fetch = (async (input: URL) => {
    calls.push(input);
    const page = pages[input.searchParams.get("cursor") ?? ""];
    return page ? Response.json(page) : new Response("nope", { status: 400 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const rec = (subject: unknown) => ({ uri: "at://x/app.bsky.graph.follow/1", cid: "c", value: { subject } });

describe("listBskyFollows", () => {
  it("pages with the cursor, dedupes, and skips subjects that aren't DIDs", async () => {
    const { fetch, calls } = fakePds({
      "": { cursor: "a", records: [rec(did(1)), rec(did(2)), rec("not-a-did"), rec(42)] },
      a: { cursor: "b", records: [rec(did(2)), rec(did(3)), { value: null }] },
      b: { records: [rec(did(4))] },
    });
    expect(await listBskyFollows(ME, { pds: PDS, fetch })).toEqual([did(1), did(2), did(3), did(4)]);
    expect(calls).toHaveLength(3);
    expect(calls[0].pathname).toBe("/xrpc/com.atproto.repo.listRecords");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      repo: ME,
      collection: "app.bsky.graph.follow",
      limit: "100",
    });
    expect(calls[2].searchParams.get("cursor")).toBe("b");
  });

  it("stops when the PDS repeats its cursor or returns an empty page", async () => {
    const repeat = fakePds({ "": { cursor: "a", records: [rec(did(1))] }, a: { cursor: "a", records: [rec(did(2))] } });
    expect(await listBskyFollows(ME, { pds: PDS, fetch: repeat.fetch })).toEqual([did(1), did(2)]);
    expect(repeat.calls).toHaveLength(2);

    const empty = fakePds({ "": { cursor: "a", records: [] } });
    expect(await listBskyFollows(ME, { pds: PDS, fetch: empty.fetch })).toEqual([]);
    expect(empty.calls).toHaveLength(1);
  });

  it("throws PdsError when the PDS fails", async () => {
    const { fetch } = fakePds({ "": { cursor: "missing", records: [rec(did(1))] } });
    await expect(listBskyFollows(ME, { pds: PDS, fetch })).rejects.toBeInstanceOf(PdsError);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(listBskyFollows(ME, { pds: PDS, fetch: down })).rejects.toBeInstanceOf(PdsError);
  });
});
