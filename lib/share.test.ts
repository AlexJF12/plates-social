import { describe, expect, it } from "vitest";
import { safeNext } from "./links";
import {
  BSKY_POST_MAX_GRAPHEMES,
  blueskyPostText,
  cookShareText,
  cookShareUrl,
  graphemeLength,
  messageText,
  starsText,
  visitShareText,
  visitShareUrl,
} from "./share";

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
    expect(messageText({ title: "Bleeg", body: "  Crispy.\nGood.  " }, URL_)).toBe(`Bleeg\n\nCrispy.\nGood.\n\n${URL_}`);
  });
  it("skips a missing or blank note", () => {
    expect(messageText({ title: "Bleeg", body: null }, URL_)).toBe(`Bleeg\n\n${URL_}`);
    expect(messageText({ title: "Bleeg", body: "   " }, URL_)).toBe(`Bleeg\n\n${URL_}`);
  });
});

describe("blueskyPostText", () => {
  it("is dish, note, link with a link facet over the URL", () => {
    const { text, facets } = blueskyPostText({ title: "Crème brûlée 🍮", body: "Torched it 🔥" }, URL_);
    expect(text).toBe(`Crème brûlée 🍮\n\nTorched it 🔥\n\n${URL_}`);
    expect(facets).toHaveLength(1);
    expect(facets[0].features).toEqual([{ $type: "app.bsky.richtext.facet#link", uri: URL_ }]);
    // Byte offsets, not string indexes: the emoji and accents come first.
    expect(facetText(text, facets[0])).toBe(URL_);
    expect(facets[0].index.byteEnd).toBe(bytes(text).length);
  });

  it("works without a note", () => {
    const { text, facets } = blueskyPostText({ title: "Bleeg", body: null }, URL_);
    expect(text).toBe(`Bleeg\n\n${URL_}`);
    expect(facetText(text, facets[0])).toBe(URL_);
  });

  it("cuts a long note to fit 300 graphemes, keeping dish and link whole", () => {
    const note = "👩‍🍳".repeat(1000); // one grapheme, many code units and bytes
    const { text, facets } = blueskyPostText({ title: "D".repeat(100), body: note }, URL_);
    expect(graphemeLength(text)).toBe(BSKY_POST_MAX_GRAPHEMES);
    expect(text.startsWith("D".repeat(100) + "\n\n👩‍🍳")).toBe(true);
    expect(text.endsWith(`…\n\n${URL_}`)).toBe(true);
    expect(facetText(text, facets[0])).toBe(URL_);
  });

  it("keeps a note that exactly fits", () => {
    const room = BSKY_POST_MAX_GRAPHEMES - 5 - 2 - graphemeLength(URL_) - 2;
    const note = "n".repeat(room);
    const { text } = blueskyPostText({ title: "Bleeg", body: note }, URL_);
    expect(text).toBe(`Bleeg\n\n${note}\n\n${URL_}`);
    expect(graphemeLength(text)).toBe(BSKY_POST_MAX_GRAPHEMES);
    expect(blueskyPostText({ title: "Bleeg", body: note + "n" }, URL_).text).toContain("…");
  });

  it("drops the note when there's no room for it", () => {
    const long = `https://cooklog.example/${"x".repeat(190)}`;
    const { text } = blueskyPostText({ title: "D".repeat(100), body: "hello" }, long);
    expect(text).toBe(`${"D".repeat(100)}\n\n${long}`);
  });
});

describe("visit sharing", () => {
  const visit = { restaurantName: "Lilia", restaurantArea: "Brooklyn", rating: 4, review: "Agnolotti." };

  it("links to the visit page", () => {
    expect(visitShareUrl("https://cooklog.example", DID, RKEY)).toBe(`https://cooklog.example/visit/${DID}/${RKEY}`);
  });

  it("stars: filled to the rating", () => {
    expect([1, 4, 5].map(starsText)).toEqual(["★☆☆☆☆", "★★★★☆", "★★★★★"]);
  });

  it("restaurant and area, the stars, the review, then the link", () => {
    const url = visitShareUrl("https://cooklog.example", DID, RKEY);
    const { text, facets } = blueskyPostText(visitShareText(visit), url);
    expect(text).toBe(`Lilia, Brooklyn\n★★★★☆\n\nAgnolotti.\n\n${url}`);
    expect(facetText(text, facets[0])).toBe(url);
    expect(messageText(visitShareText({ ...visit, restaurantArea: null, review: null }), url)).toBe(`Lilia\n★★★★☆\n\n${url}`);
  });

  it("a long review is cut to fit, the name, area and stars stay whole", () => {
    const long = { restaurantName: "N".repeat(100), restaurantArea: "A".repeat(100), rating: 2, review: "r".repeat(1000) };
    const url = visitShareUrl("https://cooklog.example", DID, RKEY);
    const { text } = blueskyPostText(visitShareText(long), url);
    expect(graphemeLength(text)).toBe(BSKY_POST_MAX_GRAPHEMES);
    expect(text.startsWith(`${"N".repeat(100)}, ${"A".repeat(100)}\n★★☆☆☆\n\nr`)).toBe(true);
    expect(text.endsWith(`…\n\n${url}`)).toBe(true);
  });

  it("cookShareText is the dish and note", () => {
    expect(cookShareText({ dishName: " Bleeg ", note: "n" })).toEqual({ title: "Bleeg", body: "n" });
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
