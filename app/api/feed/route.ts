import { NextRequest, NextResponse } from "next/server";
import { isValidDid } from "@atproto/syntax";
import { getCookFeed } from "@/lib/db/queries";

// GET /api/feed?cursor=…[&author=did] — next page for infinite scroll.
// Index data only, all of it public on the network anyway.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const author = params.get("author");
  if (author !== null && !isValidDid(author)) {
    return NextResponse.json({ error: "Invalid author" }, { status: 400 });
  }
  const page = await getCookFeed({ authorDid: author ?? undefined, cursor: params.get("cursor") });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
