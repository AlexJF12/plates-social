import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "./stripJpeg";
import { verifyImage } from "./verify";

const base = (w = 40, h = 30) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } });

const bytes = (b: Buffer) => new Uint8Array(b);
const pixels = async (b: Uint8Array) => (await sharp(b).raw().toBuffer()).toString("base64");

// The EXIF block iOS Safari's canvas encoder wrote on a real iPhone upload
// (logged from /api/blob): ColorSpace=sRGB, PixelX=2000, PixelY=1500.
const SAFARI_EXIF = Buffer.from(
  "RXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAH0KADAAQAAAABAAAF3AAAAAA=",
  "base64",
);

// Insert an APP1 segment right after SOI, as Safari does.
const withApp1 = (jpeg: Buffer, payload: Buffer) => {
  const len = payload.length + 2;
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), payload, jpeg.subarray(2)]);
};

const gpsJpeg = () =>
  base()
    .jpeg()
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 44/1 0/1" },
    })
    .toBuffer();

describe("verifyImage", () => {
  it("accepts a clean JPEG and reports its size", async () => {
    const r = await verifyImage(bytes(await base().jpeg().toBuffer()));
    expect(r).toMatchObject({ mimeType: "image/jpeg", width: 40, height: 30 });
  });

  it("accepts a clean WebP", async () => {
    const r = await verifyImage(bytes(await base().webp().toBuffer()));
    expect(r).toMatchObject({ mimeType: "image/webp" });
  });

  it("accepts iOS Safari canvas output, with its EXIF block removed", async () => {
    const input = withApp1(await base().jpeg().toBuffer(), SAFARI_EXIF);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const r = await verifyImage(bytes(input));
    if ("error" in r) throw new Error(r.error);
    expect((await sharp(r.bytes).metadata()).exif).toBeUndefined();
    expect(r.bytes.length).toBe(input.length - SAFARI_EXIF.length - 4);
  });

  it("strips EXIF with GPS from a JPEG without touching pixels", async () => {
    const input = bytes(await gpsJpeg());
    const r = await verifyImage(input);
    if ("error" in r) throw new Error(r.error);
    const meta = await sharp(r.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Buffer.from(r.bytes).includes(Buffer.from("iPhone 15"))).toBe(false);
    expect(await pixels(r.bytes)).toBe(await pixels(input));
  });

  it("strips XMP and keeps the ICC profile (Display P3 colour)", async () => {
    const input = await base()
      .jpeg()
      .withIccProfile("p3")
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>')
      .toBuffer();
    const before = await sharp(input).metadata();
    expect(before.xmp).toBeDefined();
    expect(before.icc).toBeDefined();
    const r = await verifyImage(bytes(input));
    if ("error" in r) throw new Error(r.error);
    const after = await sharp(r.bytes).metadata();
    expect(after.xmp).toBeUndefined();
    expect(after.icc?.equals(before.icc!)).toBe(true);
  });

  it("rejects WebP carrying EXIF (not stripped; our client only sends JPEG)", async () => {
    const webp = await base().webp().withExif({ IFD0: { Make: "Apple" } }).toBuffer();
    expect(await verifyImage(bytes(webp))).toEqual({ error: "Image still has metadata (EXIF/XMP/IPTC)" });
  });

  it("rejects PNG", async () => {
    const r = await verifyImage(bytes(await base().png().toBuffer()));
    expect(r).toEqual({ error: "Unsupported format: png" });
  });

  it("rejects non-images and empty bodies", async () => {
    expect(await verifyImage(new TextEncoder().encode("hello"))).toEqual({ error: "Not a readable image" });
    expect(await verifyImage(new Uint8Array())).toEqual({ error: "Empty image" });
  });

  it("rejects anything over 1,000,000 bytes", async () => {
    expect(await verifyImage(new Uint8Array(1_000_001))).toEqual({ error: "Image is over 1 MB" });
  });
});

describe("stripJpegMetadata", () => {
  it("removes COM segments", async () => {
    const jpeg = await base().jpeg().toBuffer();
    const text = Buffer.from("taken at 12 Home St");
    const withCom = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xfe, 0, text.length + 2]), text, jpeg.subarray(2)]);
    expect(Buffer.from(stripJpegMetadata(withCom)).includes(text)).toBe(false);
  });

  it("rejects truncated or non-JPEG input", () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50]))).toThrow();
    expect(() => stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toThrow();
  });
});
