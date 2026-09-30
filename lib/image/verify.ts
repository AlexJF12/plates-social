import sharp, { type Metadata } from "sharp";
import { stripJpegMetadata } from "./stripJpeg";

export const MAX_IMAGE_BYTES = 1_000_000; // cook.json #image maxSize
const ALLOWED = { jpeg: "image/jpeg", webp: "image/webp" } as const;

export type VerifiedImage = {
  bytes: Uint8Array; // what to upload: metadata removed
  mimeType: (typeof ALLOWED)[keyof typeof ALLOWED];
  width: number;
  height: number;
};

const hasPersonalMetadata = (m: Metadata) => Boolean(m.exif || m.xmp || m.iptc);

// Server-side gate before uploadBlob. The client already re-encodes through
// a canvas, which drops the camera's EXIF (including GPS). Here we also strip
// JPEG metadata segments losslessly (iOS Safari's encoder adds a small EXIF
// block of its own) and refuse anything that still carries EXIF/XMP/IPTC, so
// a client bug can never leak a location. It also sniffs the real format
// instead of trusting Content-Type, and measures the dimensions we record as
// aspectRatio.
export async function verifyImage(
  input: Uint8Array,
): Promise<VerifiedImage | { error: string }> {
  if (input.byteLength === 0) return { error: "Empty image" };
  if (input.byteLength > MAX_IMAGE_BYTES) return { error: "Image is over 1 MB" };

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return { error: "Not a readable image" };
  }

  const mimeType = ALLOWED[meta.format as keyof typeof ALLOWED];
  if (!mimeType) return { error: `Unsupported format: ${meta.format}` };

  let bytes = input;
  if (meta.format === "jpeg") {
    try {
      bytes = stripJpegMetadata(input);
      meta = await sharp(bytes).metadata();
    } catch {
      return { error: "Not a readable image" };
    }
  }
  if (hasPersonalMetadata(meta)) return { error: "Image still has metadata (EXIF/XMP/IPTC)" };
  if (!meta.width || !meta.height) return { error: "Image has no dimensions" };

  return { bytes, mimeType, width: meta.width, height: meta.height };
}
