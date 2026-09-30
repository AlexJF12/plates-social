import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCidForBytes, parseCidSafe } from "@atproto/lex";
import { sql } from "kysely";
import sharp from "sharp";
import { getDb } from "../db";
import { resolvePds } from "../pds";
import type { ImageSize } from "./url";

// Image proxy (§6.5). Serves blobs from authors' PDSes, resized, cached on
// disk. Content-addressed: the cache key is the CID, and the fetched bytes
// are checked against it, so a cached file never needs invalidating.

const CACHE_DIR = process.env.IMAGE_CACHE_DIR || path.join(process.cwd(), ".cache", "img");
// Lexicon max is 1 MB for cook photos and Bluesky avatars; leave headroom.
const MAX_FETCH_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 15_000;

const SIZES: Record<ImageSize, { width: number; height: number; fit: "cover" | "inside" }> = {
  avatar: { width: 128, height: 128, fit: "cover" },
  // Feed cards: full phone width at ~3x.
  thumb: { width: 1080, height: 1350 * 2, fit: "inside" },
  // Detail view: uploads are already ≤2000px on the long edge.
  full: { width: 2000, height: 2000, fit: "inside" },
};

export const isImageSize = (s: string | null): s is ImageSize =>
  s !== null && Object.hasOwn(SIZES, s);

// Only CIDs referenced by an indexed record from a visible account may be
// served; anything else would make this an open proxy. Checked on every
// request (not only on cache misses), so deleted cooks stop serving.
export async function isReferenced(did: string, cid: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom("account")
    .select("did")
    .where("did", "=", did)
    .where("active", "=", true)
    .where((eb) =>
      eb.or([
        eb("avatarCid", "=", cid),
        eb.exists(
          eb
            .selectFrom("cook")
            .select(sql`1`.as("one"))
            .where("cook.authorDid", "=", did)
            .where(sql<boolean>`cook.images @> ${JSON.stringify([{ cid }])}::jsonb`),
        ),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}

export class UpstreamError extends Error {}

async function fetchBlob(did: string, cid: string): Promise<Uint8Array> {
  const pds = await resolvePds(did);
  if (!pds) throw new UpstreamError(`no usable PDS for ${did}`);

  const url = new URL("/xrpc/com.atproto.sync.getBlob", pds);
  url.searchParams.set("did", did);
  url.searchParams.set("cid", cid);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "error" });
  } catch (err) {
    throw new UpstreamError(`getBlob failed: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok || !res.body) throw new UpstreamError(`getBlob ${res.status}`);
  if (!res.headers.get("content-type")?.startsWith("image/")) {
    throw new UpstreamError(`getBlob content-type ${res.headers.get("content-type")}`);
  }

  // Read with a cap instead of trusting Content-Length.
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = res.body.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      total += r.value.byteLength;
      if (total > MAX_FETCH_BYTES) {
        await reader.cancel();
        throw new UpstreamError("blob too large");
      }
      chunks.push(r.value);
    }
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(`getBlob read failed: ${err instanceof Error ? err.message : err}`);
  }
  const bytes = Buffer.concat(chunks);

  const parsed = parseCidSafe(cid);
  if (!parsed || !(await isCidForBytes(parsed, bytes))) {
    throw new UpstreamError("blob bytes don't match the CID");
  }
  return bytes;
}

async function render(bytes: Uint8Array, size: ImageSize): Promise<Buffer> {
  const img = sharp(bytes, { limitInputPixels: 50_000_000 });
  const { format } = await img.metadata().catch(() => ({ format: undefined }));
  // Sniff the real format; the PDS's Content-Type is only a claim.
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new UpstreamError(`unsupported format ${format}`);
  }
  const { width, height, fit } = SIZES[size];
  // rotate() applies any EXIF orientation; output carries no metadata.
  return img
    .rotate()
    .resize({ width, height, fit, withoutEnlargement: true })
    .webp({ quality: size === "full" ? 85 : 80 })
    .toBuffer()
    .catch((err: Error) => {
      throw new UpstreamError(`decode failed: ${err.message}`);
    });
}

// Concurrent requests for the same uncached image share one fetch.
const inflight = new Map<string, Promise<Buffer>>();

export async function getImage(did: string, cid: string, size: ImageSize): Promise<Buffer> {
  const file = path.join(CACHE_DIR, `${cid}-${size}.webp`);
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }

  let pending = inflight.get(file);
  if (!pending) {
    pending = (async () => {
      const out = await render(await fetchBlob(did, cid), size);
      await mkdir(CACHE_DIR, { recursive: true });
      // Write then rename, so a crash never leaves a truncated cache file.
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, out);
      await rename(tmp, file);
      return out;
    })().finally(() => inflight.delete(file));
    inflight.set(file, pending);
  }
  return pending;
}
