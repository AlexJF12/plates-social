import { NextRequest, NextResponse } from "next/server";
import { Client, lexToJson } from "@atproto/lex";
import { getSession } from "@/lib/auth/session";
import { MAX_IMAGE_BYTES, verifyImage } from "@/lib/image/verify";

// One photo per request (keeps each upload short, so a suspended PWA loses
// at most one photo's progress). Body: the raw JPEG/WebP bytes, already
// resized and EXIF-stripped by lib/image/process.ts.
//
// The server strips JPEG metadata before upload (lib/image/verify.ts).
// Returns the blob ref as JSON ({"$link": cid}) plus measured dimensions.
// The PDS garbage-collects blobs no record references, so the client
// creates the cook right after.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image is over 1 MB" }, { status: 413 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  const verified = await verifyImage(bytes);
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  try {
    const res = await new Client(session).uploadBlob(verified.bytes, {
      encoding: verified.mimeType,
    });
    return NextResponse.json({
      blob: lexToJson(res.body.blob),
      width: verified.width,
      height: verified.height,
    });
  } catch (err) {
    console.error("uploadBlob failed", err);
    return NextResponse.json(
      { error: "Upload to your PDS failed" },
      { status: 502 },
    );
  }
}
