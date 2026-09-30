// Browser-only image pipeline (§6.5). No imports: e2e/image-pipeline.spec.ts
// transpiles this file on its own and runs it in Chromium.
//
// Decoding through an <img> applies the EXIF orientation (portrait iPhone
// photos come out upright), and re-encoding through a canvas writes a fresh
// JPEG with no EXIF at all, which removes GPS location. HEIC: iOS Safari
// hands the page a JPEG for accept="image/*"; where a browser can't decode
// the file, loadImage rejects and the form says so.

export const MAX_EDGE = 2000;
export const MAX_BYTES = 1_000_000; // cook.json #image maxSize

export type ProcessedImage = {
  blob: Blob; // image/jpeg
  width: number;
  height: number;
};

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img
    .decode()
    .then(() => img)
    .finally(() => URL.revokeObjectURL(url));
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      quality,
    ),
  );
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error("This photo format isn't supported by your browser");
  }

  // naturalWidth/Height are already orientation-corrected.
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  let scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));

  // Lower quality first, then size, until it fits under the blob limit.
  const qualities = [0.85, 0.75, 0.65];
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualities) {
      const blob = await encode(canvas, q);
      if (blob.size < MAX_BYTES) return { blob, width, height };
    }
    scale *= 0.75;
  }
  throw new Error("Couldn't shrink this photo under 1 MB");
}
