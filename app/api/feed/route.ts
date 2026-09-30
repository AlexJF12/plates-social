import { NextRequest, NextResponse } from "next/server";
import { isValidDid } from "@atproto/syntax";
import { getDid } from "@/lib/auth/session";
import { getCookFeed } from "@/lib/db/queries";

// GET /api/feed?cursor=…[&author=did | &feed=following] — next page for
// infinite scroll. Global and profile feeds are public index data (public
// on the network anyway); the following feed is the signed-in viewer's.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const author = params.get("author");
  if (author !== null && !isValidDid(author)) {
    return NextResponse.json({ error: "Invalid author" }, { status: 400 });
  }
  let followedBy: string | undefined;
  if (params.get("feed") === "following") {
    const did = await getDid();
    if (!did) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    followedBy = did;
  }
  const page = await getCookFeed({ authorDid: author ?? undefined, followedBy, cursor: params.get("cursor") });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
