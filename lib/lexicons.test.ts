import { jsonToLex } from "@atproto/lex";
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "./config";
import { comment, cook, follow, kudos } from "./lexicons";

// Records arrive from Tap as JSON (CIDs as {"$link": ...}), so every fixture
// goes through jsonToLex before $parse, the same path the webhook will use.
const parse = <T>(schema: { $parse: (v: unknown) => T }, json: unknown) =>
  schema.$parse(jsonToLex(json as never));

const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const COOK_URI = "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/com.example.cooklog.cook/3l3qo2vutsw2b";

const blob = (mimeType = "image/jpeg", size = 500_000) => ({
  $type: "blob",
  ref: { $link: CID },
  mimeType,
  size,
});

const image = (overrides: object = {}) => ({
  image: blob(),
  alt: "Pasta",
  aspectRatio: { width: 3, height: 4 },
  ...overrides,
});

const validCook = (overrides: object = {}) => ({
  $type: COLLECTIONS.cook,
  dishName: "Cacio e pepe",
  mealType: "dinner",
  note: "Too much pepper.",
  images: [image()],
  cookedAt: "2026-09-29T19:30:00-04:00",
  createdAt: "2026-09-29T23:31:02.000Z",
  ...overrides,
});

describe("lexicon ids match NS", () => {
  it("uses the collections from lib/config", () => {
    expect(cook.$type).toBe(COLLECTIONS.cook);
    expect(kudos.$type).toBe(COLLECTIONS.kudos);
    expect(comment.$type).toBe(COLLECTIONS.comment);
    expect(follow.$type).toBe(COLLECTIONS.follow);
  });
});

describe("cook", () => {
  it("accepts a valid record and keeps the offset in cookedAt", () => {
    const rec = parse(cook, validCook());
    expect(rec.dishName).toBe("Cacio e pepe");
    expect(rec.cookedAt).toBe("2026-09-29T19:30:00-04:00");
    expect(rec.images).toHaveLength(1);
  });

  it("accepts 4 images, webp, no alt and no note", () => {
    const imgs = Array.from({ length: 4 }, () =>
      image({ image: blob("image/webp"), alt: undefined }),
    );
    expect(() =>
      parse(cook, validCook({ note: undefined, images: imgs })),
    ).not.toThrow();
  });

  it("accepts unknown meal types (displayed as Other)", () => {
    expect(parse(cook, validCook({ mealType: "brunch" })).mealType).toBe(
      "brunch",
    );
  });

  it("accepts 100 graphemes of emoji in dishName", () => {
    // One grapheme, 4 UTF-8 bytes each.
    expect(() => parse(cook, validCook({ dishName: "🍝".repeat(100) }))).not.toThrow();
  });

  it("byte cap (maxLength 1000) still applies to multi-codepoint emoji", () => {
    // A ZWJ family emoji is 1 grapheme but 18 bytes: 100 of them = 1800 bytes.
    expect(() => parse(cook, validCook({ dishName: "👨‍👩‍👧".repeat(100) }))).toThrow();
  });

  it.each([
    ["no images", { images: [] }],
    ["5 images", { images: Array.from({ length: 5 }, () => image()) }],
    ["empty dishName", { dishName: "" }],
    ["101-grapheme dishName", { dishName: "a".repeat(101) }],
    ["1001-grapheme note", { note: "a".repeat(1001) }],
    ["301-grapheme alt", { images: [image({ alt: "a".repeat(301) })] }],
    ["png image", { images: [image({ image: blob("image/png") })] }],
    ["image over 1,000,000 bytes", { images: [image({ image: blob("image/jpeg", 1_000_001) })] }],
    ["missing aspectRatio", { images: [image({ aspectRatio: undefined })] }],
    ["zero aspectRatio width", { images: [image({ aspectRatio: { width: 0, height: 4 } })] }],
    ["non-integer aspectRatio", { images: [image({ aspectRatio: { width: 1.5, height: 4 } })] }],
    ["bad cookedAt", { cookedAt: "yesterday" }],
    ["missing mealType", { mealType: undefined }],
    ["65-char mealType", { mealType: "a".repeat(65) }],
    ["wrong $type", { $type: "app.bsky.feed.post" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => parse(cook, validCook(overrides))).toThrow();
  });
});

describe("kudos", () => {
  const valid = {
    $type: COLLECTIONS.kudos,
    subject: { uri: COOK_URI, cid: CID },
    createdAt: "2026-09-29T23:31:02.000Z",
  };

  it("accepts a valid record", () => {
    expect(parse(kudos, valid).subject.uri).toBe(COOK_URI);
  });

  it("rejects a subject without a cid", () => {
    expect(() => parse(kudos, { ...valid, subject: { uri: COOK_URI } })).toThrow();
  });
});

describe("comment", () => {
  const valid = {
    $type: COLLECTIONS.comment,
    subject: { uri: COOK_URI, cid: CID },
    text: "Looks great",
    createdAt: "2026-09-29T23:31:02.000Z",
  };

  it("accepts a valid record", () => {
    expect(parse(comment, valid).text).toBe("Looks great");
  });

  it.each([
    ["empty text", { text: "" }],
    ["501-grapheme text", { text: "a".repeat(501) }],
    ["missing subject", { subject: undefined }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => parse(comment, { ...valid, ...overrides })).toThrow();
  });
});

describe("follow", () => {
  const valid = {
    $type: COLLECTIONS.follow,
    subject: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
    createdAt: "2026-09-29T23:31:02.000Z",
  };

  it("accepts a valid record", () => {
    expect(parse(follow, valid).subject).toBe(valid.subject);
  });

  it("rejects a handle as subject", () => {
    expect(() => parse(follow, { ...valid, subject: "alice.bsky.social" })).toThrow();
  });
});
