import { NextRequest, NextResponse } from "next/server";
import { Client, jsonToLex, l } from "@atproto/lex";
import { isValidTid } from "@atproto/syntax";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { hasVisitScope } from "@/lib/auth/scope";
import { getSession } from "@/lib/auth/session";
import { COLLECTIONS } from "@/lib/config";
import { MEAL_TYPES } from "@/lib/cook/mealTypes";
import { getDb } from "@/lib/db";
import { visitUriOf } from "@/lib/db/queries";
import { readJson } from "@/lib/http";
import { ensureAccount } from "@/lib/indexer/account";
import { upsertVisit, visitRow } from "@/lib/indexer/visit";
import { visit } from "@/lib/lexicons";
import { deleteOwnRecord } from "@/lib/social/write";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Sessions from before visits were added lack `repo:NS.visit`: posting or
// deleting a visit asks them to sign in again (same pattern as Post to
// Bluesky). Everything else keeps working on the old session.
async function needsReauth(session: OAuthSession) {
  const { scope } = await session.getTokenInfo(false);
  if (hasVisitScope(scope)) return null;
  return NextResponse.json(
    { error: "Sign in again to allow posting visits", reauth: true },
    { status: 403 },
  );
}

// POST { rkey, restaurantName, restaurantArea?, rating, review?, mealType,
// visitedAt, images } — create a visit on the user's PDS, then upsert it
// into the index (read-your-own-writes, §3). Same retry rule as /api/cook:
// `rkey` is a client TID reused on retry, so a lost response can't post twice.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const rkey = str(body.rkey);
  if (!isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }

  // As for cooks: this app only writes the known meal types.
  const mealType = str(body.mealType);
  if (!MEAL_TYPES.some((m) => m.value === mealType)) {
    return NextResponse.json({ error: "Invalid mealType" }, { status: 400 });
  }

  const area = str(body.restaurantArea);
  const review = str(body.review);
  const images = Array.isArray(body.images) ? (body.images as Record<string, unknown>[]) : [];
  const recordJson = {
    $type: COLLECTIONS.visit,
    restaurant: { name: str(body.restaurantName), ...(area ? { area } : {}) },
    // Not coerced: "4" or 3.5 fail the Lexicon's integer rule below.
    rating: body.rating,
    ...(review ? { review } : {}),
    mealType,
    images: images.map((img) => {
      const alt = str(img?.alt);
      return {
        image: img?.blob,
        ...(alt ? { alt } : {}),
        aspectRatio: { width: img?.width, height: img?.height },
      };
    }),
    visitedAt: str(body.visitedAt),
    createdAt: l.currentDatetimeString(),
  };

  // Enforce every §4 limit here too, before anything reaches the PDS.
  let record: visit.Main;
  try {
    record = visit.$parse(jsonToLex(recordJson as never));
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid visit: ${err instanceof Error ? err.message : err}` },
      { status: 400 },
    );
  }

  const reauth = await needsReauth(session);
  if (reauth) return reauth;

  const client = new Client(session);
  let uri: string;
  let cid: string;
  try {
    ({ uri, cid } = await client.create(visit, record, { rkey }));
  } catch (err) {
    const existing = await client.get(visit, { rkey }).catch(() => null);
    if (!existing) {
      console.error("createRecord failed", err);
      return NextResponse.json({ error: "Posting to your PDS failed" }, { status: 502 });
    }
    // An earlier attempt with this rkey already landed.
    ({ uri, cid } = existing as { uri: string; cid: string });
    record = existing.value;
  }

  // The visit is on the PDS either way; if this fails, Tap indexes it later.
  try {
    await ensureAccount(getDb(), session.did);
    await upsertVisit(getDb(), visitRow({ uri, cid, authorDid: session.did, record }));
  } catch (err) {
    console.error("read-your-own-writes upsert failed", uri, err);
  }

  return NextResponse.json({ uri, cid });
}

// DELETE { rkey } — delete one of your own visits (§6.6). A visit that's
// already gone counts as deleted, so this can be retried.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rkey = (await readJson(request))?.rkey;
  if (typeof rkey !== "string" || !isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }

  const reauth = await needsReauth(session);
  if (reauth) return reauth;

  const uri = visitUriOf(session.did, rkey);
  try {
    await deleteOwnRecord(new Client(session), getDb(), "visit", uri);
    return NextResponse.json({ deleted: uri });
  } catch (err) {
    console.error("visit delete failed", err);
    return NextResponse.json({ error: "Deleting your visit failed on your PDS" }, { status: 502 });
  }
}
