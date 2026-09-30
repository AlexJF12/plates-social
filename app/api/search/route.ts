import { NextRequest, NextResponse } from "next/server";
import { getDid } from "@/lib/auth/session";
import { type Author, type CookView, searchCooks, searchPeople } from "@/lib/db/queries";
import { normalizeMeal, normalizeQuery } from "@/lib/search";

export type SearchResult = { people: Author[]; items: CookView[]; cursor: string | null };

// GET /api/search?q=&meal=&cursor= (Phase 6.6). Cooks whose dish name
// contains q, newest first, paged like /api/feed. The first page (no
// cursor) without a meal filter also has up to 5 matching people. Signed
// in only, like every screen that uses it.
export async function GET(request: NextRequest) {
  const viewer = await getDid();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const q = normalizeQuery(params.get("q"));
  if (!q) return NextResponse.json({ error: "Query too short" }, { status: 400 });
  const mealType = normalizeMeal(params.get("meal"));
  const cursor = params.get("cursor");
  const [page, people] = await Promise.all([
    searchCooks({ q, mealType, cursor, viewer }),
    cursor || mealType ? [] : searchPeople(q),
  ]);
  const body: SearchResult = { people, ...page };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
