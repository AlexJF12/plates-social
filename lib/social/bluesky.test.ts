import { type Client, jsonToLex } from "@atproto/lex";
import { describe, expect, it, vi } from "vitest";
import { BSKY_POST, COLLECTIONS, SCOPE } from "../config";
import { cook } from "../lexicons";
import { bskyPostRecord, createBskyPost, hasBskyPostScope } from "./bluesky";

const ME = "did:plc:testalice00000000000000a";
const COOK_RKEY = "3mwovhkvtw723";
const POST_RKEY = "3mwpabcdefg22";
const URL_ = `https://cooklog.example/cook/${ME}/${COOK_RKEY}`;
const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";

const cookRecord: cook.Main = cook.$parse(
  jsonToLex({
    $type: COLLECTIONS.cook,
    dishName: "Bleeg",
    mealType: "dinner",
    note: "Crispy edges.",
    images: [
      { image: { $type: "blob", ref: { $link: CID }, mimeType: "image/jpeg", size: 1234 }, alt: "A pan", aspectRatio: { width: 4, height: 3 } },
      { image: { $type: "blob", ref: { $link: CID }, mimeType: "image/jpeg", size: 1234 }, aspectRatio: { width: 1, height: 1 } },
    ],
    cookedAt: "2026-09-30T19:00:00.000+01:00",
    createdAt: "2026-09-30T19:05:00.000Z",
  }),
);

describe("hasBskyPostScope", () => {
  it("needs the create (or full) feed.post repo scope", () => {
    expect(hasBskyPostScope(SCOPE)).toBe(true);
    expect(hasBskyPostScope(`atproto repo:${BSKY_POST}`)).toBe(true);
    expect(hasBskyPostScope(`atproto repo:${COLLECTIONS.cook} blob:image/*`)).toBe(false);
    expect(hasBskyPostScope(`atproto repo:${BSKY_POST}?action=delete`)).toBe(false);
    expect(hasBskyPostScope(undefined)).toBe(false);
  });
  it("is the only app.bsky.* write in SCOPE, create only", () => {
    expect(SCOPE.split(" ").filter((s) => s.includes("app.bsky"))).toEqual([`repo:${BSKY_POST}?action=create`]);
    expect(SCOPE).not.toContain("transition:generic");
  });
});

describe("bskyPostRecord", () => {
  it("embeds the cook's own photo blobs with alt and aspect ratio", () => {
    const r = bskyPostRecord(cookRecord, URL_, "2026-10-01T10:00:00.000Z");
    expect(r.$type).toBe("app.bsky.feed.post");
    expect(r.text).toBe(`Bleeg\n\nCrispy edges.\n\n${URL_}`);
    expect(r.createdAt).toBe("2026-10-01T10:00:00.000Z");
    expect(r.embed.$type).toBe("app.bsky.embed.images");
    expect(r.embed.images).toHaveLength(2);
    expect(r.embed.images[0].image).toBe(cookRecord.images[0].image); // same blob ref, no re-upload
    expect(r.embed.images.map((i) => i.alt)).toEqual(["A pan", ""]); // alt is required by Bluesky
    expect(r.embed.images[0].aspectRatio).toEqual({ width: 4, height: 3 });
    expect(r.facets[0].features[0].uri).toBe(URL_);
  });
});

// A stand-in for the lex Client: only the calls createBskyPost makes.
function fakeClient(opts: { existing?: boolean; createFails?: boolean; landsAnyway?: boolean }) {
  let stored = opts.existing ?? false;
  const client = {
    getRecord: vi.fn(async () => {
      if (!stored) throw new Error("RecordNotFound");
      return { body: { value: {} } };
    }),
    get: vi.fn(async () => ({ value: cookRecord })),
    createRecord: vi.fn(async () => {
      if (opts.landsAnyway) stored = true;
      if (opts.createFails) throw new Error("timeout");
      stored = true;
      return {};
    }),
  };
  return client;
}

describe("createBskyPost", () => {
  it("reads the cook from the PDS and creates the post at the given rkey", async () => {
    const c = fakeClient({});
    const out = await createBskyPost(c as unknown as Client, ME, COOK_RKEY, POST_RKEY, URL_);
    expect(out).toEqual({
      uri: `at://${ME}/${BSKY_POST}/${POST_RKEY}`,
      url: `https://bsky.app/profile/${ME}/post/${POST_RKEY}`,
    });
    expect(c.get).toHaveBeenCalledWith(cook, { rkey: COOK_RKEY });
    expect(c.createRecord).toHaveBeenCalledTimes(1);
    const [record, rkey] = c.createRecord.mock.calls[0] as unknown as [{ text: string }, string];
    expect(rkey).toBe(POST_RKEY);
    expect(record.text).toContain(URL_);
  });

  it("a retry with the same rkey doesn't post twice", async () => {
    const c = fakeClient({ existing: true });
    await createBskyPost(c as unknown as Client, ME, COOK_RKEY, POST_RKEY, URL_);
    expect(c.createRecord).not.toHaveBeenCalled();
  });

  it("a lost response whose write landed counts as success", async () => {
    const c = fakeClient({ createFails: true, landsAnyway: true });
    await expect(createBskyPost(c as unknown as Client, ME, COOK_RKEY, POST_RKEY, URL_)).resolves.toBeTruthy();
  });

  it("a real failure throws", async () => {
    const c = fakeClient({ createFails: true });
    await expect(createBskyPost(c as unknown as Client, ME, COOK_RKEY, POST_RKEY, URL_)).rejects.toThrow("timeout");
  });
});
