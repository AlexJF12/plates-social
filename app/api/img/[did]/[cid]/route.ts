import { NextRequest, NextResponse } from "next/server";
import { parseCidSafe } from "@atproto/lex";
import { isValidDid } from "@atproto/syntax";
import { UpstreamError, getImage, isImageSize, isReferenced } from "@/lib/image/proxy";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

// GET /api/img/:did/:cid?size=avatar|thumb|full (§6.5)
export async function GET(request: NextRequest, ctx: RouteContext<"/api/img/[did]/[cid]">) {
  const { did: rawDid, cid } = await ctx.params;
  const did = decodeURIComponent(rawDid);
  const size = request.nextUrl.searchParams.get("size") ?? "thumb";
  if (!isValidDid(did) || !parseCidSafe(cid) || !isImageSize(size)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!(await isReferenced(did, cid))) return notFound();

  try {
    const body = await getImage(did, cid, size);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        // CIDs are content-addressed: the bytes behind this URL never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    console.warn(`img: ${did}/${cid}: ${err.message}`);
    return NextResponse.json(
      { error: "Image unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
