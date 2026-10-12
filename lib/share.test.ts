import { describe, expect, it } from "vitest";
import { safeNext } from "./links";
import { BSKY_POST_MAX_GRAPHEMES, blueskyPostText, cookShareUrl, graphemeLength, messageText } from "./share";

const DID = "did:plc:testalice00000000000000a";
const RKEY = "3mwovhkvtw723";
const URL_ = cookShareUrl("https://cooklog.example", DID, RKEY);
const bytes = (s: string) => new TextEncoder().encode(s);
const facetText = (text: string, f: { index: { byteStart: number; byteEnd: number } }) =>
  new TextDecoder().decode(bytes(text).slice(f.index.byteStart, f.index.byteEnd));

describe("cookShareUrl", () => {
  it("is the absolute cook page URL", () => {
    expect(URL_).toBe(`https://cooklog.example/cook/${DID}/${RKEY}`);
  });
});

describe("messageText", () => {
  it("is dish, full note, link", () => {
    expect(messageText({ dishName: "Bleeg", note: "  Crispy.\nGood.  " }, URL_)).toBe(`Bleeg\n\nCrispy.\nGood.\n\n${URL_}`);
  });
  it("skips a missing or blank note", () => {
    expect(messageText({ dishName: "Bleeg", note: null }, URL_)).toBe(`Bleeg\n\n${URL_}`);
    expect(messageText({ dishName: "Bleeg", note: "   " }, URL_)).toBe(`Bleeg\n\n${URL_}`);
  });
});

describe("blueskyPostText", () => {
  it("is dish, note, link with a link facet over the URL", () => {
    const { text, facets } = blueskyPostText({ dishName: "Crème brûlée 🍮", note: "Torched it 🔥" }, URL_);
    expect(text).toBe(`Crème brûlée 🍮\n\nTorched it 🔥\n\n${URL_}`);
    expect(facets).toHaveLength(1);
    expect(facets[0].features).toEqual([{ $type: "app.bsky.richtext.facet#link", uri: URL_ }]);
    // Byte offsets, not string indexes: the emoji and accents come first.
    expect(facetText(text, facets[0])).toBe(URL_);
    expect(facets[0].index.byteEnd).toBe(bytes(text).length);
  });

  it("works without a note", () => {
    const { text, facets } = blueskyPostText({ dishName: "Bleeg", note: null }, URL_);
    expect(text).toBe(`Bleeg\n\n${URL_}`);
    expect(facetText(text, facets[0])).toBe(URL_);
  });

  it("cuts a long note to fit 300 graphemes, keeping dish and link whole", () => {
    const note = "👩‍🍳".repeat(1000); // one grapheme, many code units and bytes
    const { text, facets } = blueskyPostText({ dishName: "D".repeat(100), note }, URL_);
    expect(graphemeLength(text)).toBe(BSKY_POST_MAX_GRAPHEMES);
    expect(text.startsWith("D".repeat(100) + "\n\n👩‍🍳")).toBe(true);
    expect(text.endsWith(`…\n\n${URL_}`)).toBe(true);
    expect(facetText(text, facets[0])).toBe(URL_);
  });

  it("keeps a note that exactly fits", () => {
    const room = BSKY_POST_MAX_GRAPHEMES - 5 - 2 - graphemeLength(URL_) - 2;
    const note = "n".repeat(room);
    const { text } = blueskyPostText({ dishName: "Bleeg", note }, URL_);
    expect(text).toBe(`Bleeg\n\n${note}\n\n${URL_}`);
    expect(graphemeLength(text)).toBe(BSKY_POST_MAX_GRAPHEMES);
    expect(blueskyPostText({ dishName: "Bleeg", note: note + "n" }, URL_).text).toContain("…");
  });

  it("drops the note when there's no room for it", () => {
    const long = `https://cooklog.example/${"x".repeat(190)}`;
    const { text } = blueskyPostText({ dishName: "D".repeat(100), note: "hello" }, long);
    expect(text).toBe(`${"D".repeat(100)}\n\n${long}`);
  });
});

describe("safeNext", () => {
  it("accepts same-site paths only", () => {
    expect(safeNext(`/cook/${DID}/${RKEY}`)).toBe(`/cook/${DID}/${RKEY}`);
    expect(safeNext("/following?x=1")).toBe("/following?x=1");
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "cook/x", "", "/a b", "/a\\b", 42, null, undefined, "/" + "a".repeat(600)]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
