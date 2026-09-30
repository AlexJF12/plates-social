// Lossless JPEG metadata removal: walks the marker segments before the image
// data and drops the ones that can carry personal metadata, without
// re-encoding pixels.
//
// Why this exists: iOS Safari's canvas encoder adds its own small EXIF block
// (ColorSpace + pixel dimensions only), so "reject any EXIF" rejected every
// iPhone upload. Stripping on the server also means nothing identifying
// reaches the PDS even from a client that skipped the canvas step.
//
// Kept: APP0 (JFIF), APP2 (ICC profile, e.g. Display P3 colour), APP14
// (Adobe colour transform), and all non-APP segments (tables, frame, scan).
// Dropped: APP1 (EXIF, XMP), APP13 (IPTC), all other APPn, COM (comments).
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input[0] !== 0xff || input[1] !== 0xd8) throw new Error("Not a JPEG");

  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new Error("Malformed JPEG");
    const marker = input[i + 1];
    // Fill bytes between segments.
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Start of scan: everything from here on is image data (plus EOI).
    if (marker === 0xda) {
      parts.push(input.subarray(i));
      break;
    }
    // Standalone markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > input.length) throw new Error("Malformed JPEG");
    const len = (input[i + 2] << 8) | input[i + 3];
    const end = i + 2 + len;
    if (len < 2 || end > input.length) throw new Error("Malformed JPEG");

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const drop = (isApp && !KEEP_APP.has(marker)) || marker === 0xfe;
    if (!drop) parts.push(input.subarray(i, end));
    i = end;
  }

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
