import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { isValidDid, isValidTid } from "@atproto/syntax";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getFollowUri } from "@/lib/db/queries";
import { createFollow, deleteFollow } from "@/lib/follows/write";

async function readBody(request: NextRequest): Promise<{ subject?: unknown; rkey?: unknown } | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

// POST { subject: did, rkey: tid } — follow (§6.3). Already following → the
// existing follow is returned, so a double tap can't create two records.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(request);
  const subject = body?.subject;
  const rkey = body?.rkey;
  if (typeof subject !== "string" || !isValidDid(subject) || subject === session.did) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof rkey !== "string" || !isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }

  const db = getDb();
  const existing = await getFollowUri(session.did, subject, db);
  if (existing) return NextResponse.json({ uri: existing });

  try {
    const uri = await createFollow(new Client(session), db, session.did, subject, rkey);
    return NextResponse.json({ uri });
  } catch (err) {
    console.error("follow failed", err);
    return NextResponse.json({ error: "Following failed on your PDS" }, { status: 502 });
  }
}

// DELETE { subject: did } — unfollow. Not following → nothing to do.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subject = (await readBody(request))?.subject;
  if (typeof subject !== "string" || !isValidDid(subject)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }

  const db = getDb();
  const uri = await getFollowUri(session.did, subject, db);
  if (!uri) return NextResponse.json({ deleted: null });

  try {
    await deleteFollow(new Client(session), db, uri);
    return NextResponse.json({ deleted: uri });
  } catch (err) {
    console.error("unfollow failed", err);
    return NextResponse.json({ error: "Unfollowing failed on your PDS" }, { status: 502 });
  }
}
