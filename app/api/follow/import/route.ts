import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { isValidDid } from "@atproto/syntax";
import { getDid, getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getImportCandidates } from "@/lib/db/queries";
import { listBskyFollows } from "@/lib/follows/bluesky";
import { followMany } from "@/lib/follows/write";

// Matches listBskyFollows' cap.
const MAX_SUBJECTS = 10_000;

// GET — the Bluesky import list (§6.3): people the viewer follows on
// Bluesky who have posted a cook here and aren't followed here yet.
export async function GET() {
  const did = await getDid();
  if (!did) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let bskyFollows: string[];
  try {
    bskyFollows = await listBskyFollows(did);
  } catch (err) {
    console.error("Bluesky follows lookup failed", did, err);
    return NextResponse.json({ error: "Couldn't read your Bluesky follows" }, { status: 502 });
  }
  const candidates = await getImportCandidates(did, bskyFollows);
  return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
}

// POST { subjects: did[] } — follow the selected people, ≤100 per
// applyWrites. Subjects are re-checked against the candidate rules, which
// also drops anyone already followed, so retrying after a partial failure
// only writes what's missing.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let subjects: unknown;
  try {
    ({ subjects } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(subjects) ||
    subjects.length === 0 ||
    subjects.length > MAX_SUBJECTS ||
    !subjects.every((s) => typeof s === "string" && isValidDid(s))
  ) {
    return NextResponse.json({ error: "Invalid subjects" }, { status: 400 });
  }

  const db = getDb();
  const toFollow = (await getImportCandidates(session.did, [...new Set(subjects as string[])], db)).map((a) => a.did);
  const { followed, error } = await followMany(new Client(session), db, session.did, toFollow);
  if (error) {
    console.error(`import: batch failed after ${followed} follows`, error);
    return NextResponse.json(
      { error: "Some follows didn't go through", followed, remaining: toFollow.length - followed },
      { status: 502 },
    );
  }
  return NextResponse.json({ followed });
}
