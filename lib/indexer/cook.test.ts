import { jsonToLex } from "@atproto/lex";
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../config";
import { cook } from "../lexicons";
import { cookRow } from "./cook";

const CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";

const record = (overrides: object = {}) =>
  cook.$parse(
    jsonToLex({
      $type: COLLECTIONS.cook,
      dishName: "Cacio e pepe",
      mealType: "dinner",
      images: [
        {
          image: { $type: "blob", ref: { $link: CID }, mimeType: "image/jpeg", size: 1234 },
          aspectRatio: { width: 3, height: 4 },
        },
      ],
      cookedAt: "2026-09-29T21:00:00-04:00",
      createdAt: "2026-09-30T01:05:00.000Z",
      ...overrides,
    } as never),
  );

const row = (rec = record(), indexedAt = new Date("2026-09-30T01:05:01.000Z")) =>
  cookRow({ uri: `at://${DID}/${COLLECTIONS.cook}/3l3qo2vutsw2b`, cid: CID, authorDid: DID, record: rec, indexedAt });

describe("cookRow", () => {
  it("maps fields and images", () => {
    const r = row();
    expect(r.dishName).toBe("Cacio e pepe");
    expect(r.note).toBeNull();
    expect(JSON.parse(r.images)).toEqual([
      { cid: CID, mime: "image/jpeg", alt: null, aspectRatio: { width: 3, height: 4 } },
    ]);
  });

  it("keeps the author's local date across midnight UTC", () => {
    const r = row();
    expect(r.cookedAt).toBe("2026-09-29T21:00:00-04:00");
    expect((r.cookedAtUtc as Date).toISOString()).toBe("2026-09-30T01:00:00.000Z");
    expect(r.cookedLocalDate).toBe("2026-09-29");
  });

  it("sortAt is createdAt when earlier than indexedAt", () => {
    expect((row().sortAt as Date).toISOString()).toBe("2026-09-30T01:05:00.000Z");
  });

  it("sortAt is indexedAt when createdAt is in the future", () => {
    const r = row(record({ createdAt: "2030-01-01T00:00:00.000Z" }));
    expect((r.sortAt as Date).toISOString()).toBe("2026-09-30T01:05:01.000Z");
  });
});
