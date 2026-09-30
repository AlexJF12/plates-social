import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import ts from "typescript";

// Runs lib/image/process.ts in Chromium on camera-like JPEGs and inspects
// the output with sharp. No sign-in or dev-server route needed: the module
// has no imports, so it's transpiled and injected into a blank page.
const source = ts.transpileModule(
  readFileSync(path.join(__dirname, "../lib/image/process.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

// A 4032x3024 sensor image (iPhone main camera) stored landscape with
// EXIF Orientation 6, i.e. a portrait photo, plus GPS coordinates.
// Random noise is incompressible, which forces the shrink loop to run.
async function cameraJpeg(opts: { noise: boolean }) {
  const [w, h] = [4032, 3024];
  const img = opts.noise
    ? sharp(Buffer.from(Array.from({ length: w * h * 3 }, () => (Math.random() * 256) | 0)), {
        raw: { width: w, height: h, channels: 3 },
      })
    : sharp({ create: { width: w, height: h, channels: 3, background: "#d9480f" } });
  return img
    .jpeg({ quality: 95 })
    .withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Make: "Apple", Model: "iPhone 15" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 44/1 5400/100", GPSLongitudeRef: "W", GPSLongitude: "73/1 59/1 0/1" },
      },
    })
    .toBuffer();
}

async function runPipeline(page: import("@playwright/test").Page, input: Buffer) {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({
    type: "module",
    content: `${source}\nwindow.__processImage = processImage;`,
  });
  await page.waitForFunction(() => "__processImage" in window);
  const out = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fn = (window as unknown as { __processImage: (b: Blob) => Promise<{ blob: Blob; width: number; height: number }> }).__processImage;
    const r = await fn(new Blob([bytes], { type: "image/jpeg" }));
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    let s = "";
    for (const x of buf) s += String.fromCharCode(x);
    return { b64: btoa(s), width: r.width, height: r.height, type: r.blob.type };
  }, input.toString("base64"));
  return { ...out, bytes: Buffer.from(out.b64, "base64") };
}

test.describe("client image pipeline", () => {
  test.setTimeout(60_000);

  test("input really has EXIF and GPS", async () => {
    const meta = await sharp(await cameraJpeg({ noise: false })).metadata();
    expect(meta.exif?.toString("latin1")).toContain("iPhone 15");
    expect(meta.exif?.includes(Buffer.from("N\0"))).toBe(true); // GPSLatitudeRef
    expect(meta.orientation).toBe(6);
  });

  test("portrait photo: upright, ≤2000px, EXIF/GPS gone", async ({ page }) => {
    const out = await runPipeline(page, await cameraJpeg({ noise: false }));
    const meta = await sharp(out.bytes).metadata();
    expect(out.type).toBe("image/jpeg");
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Orientation 6 = rotated 90°: 4032x3024 stored becomes 1500x2000 upright.
    expect([out.width, out.height]).toEqual([1500, 2000]);
    expect([meta.width, meta.height]).toEqual([1500, 2000]);
    expect(out.bytes.byteLength).toBeLessThan(1_000_000);
  });

  test("incompressible photo is shrunk under 1,000,000 bytes", async ({ page }) => {
    const input = await cameraJpeg({ noise: true });
    expect(input.byteLength).toBeGreaterThan(1_000_000);
    const out = await runPipeline(page, input);
    const meta = await sharp(out.bytes).metadata();
    expect(out.bytes.byteLength).toBeLessThan(1_000_000);
    expect(meta.exif).toBeUndefined();
    expect(out.height).toBeGreaterThan(out.width); // still portrait
    expect(Math.abs(out.width / out.height - 3024 / 4032)).toBeLessThan(0.01);
  });
});
