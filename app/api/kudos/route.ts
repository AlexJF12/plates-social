import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { isValidTid } from "@atproto/syntax";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getKudosUri, getVisibleCook } from "@/lib/db/queries";
import { readJson } from "@/lib/http";
import { createKudos, deleteOwnRecord } from "@/lib/social/write";

// POST { cook: uri, rkey: tid } — give kudos (§6.6). Already given → the
// existing kudos is returned, so a double tap can't create two records.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const rkey = body?.rkey;
  if (typeof rkey !== "string" || !isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }
  const db = getDb();
  // The strongRef needs the cook's cid, and only visible cooks get kudos.
  const target = typeof body?.cook === "string" ? await getVisibleCook(body.cook, db) : null;
  if (!target) return NextResponse.json({ error: "Cook not found" }, { status: 404 });
  if (target.authorDid === session.did) {
    return NextResponse.json({ error: "You can't give kudos to your own cook" }, { status: 400 });
  }

  const existing = await getKudosUri(session.did, target.uri, db);
  if (existing) return NextResponse.json({ uri: existing });

  try {
    const uri = await createKudos(new Client(session), db, session.did, { uri: target.uri, cid: target.cid }, rkey);
    return NextResponse.json({ uri });
  } catch (err) {
    console.error("kudos failed", err);
    return NextResponse.json({ error: "Giving kudos failed on your PDS" }, { status: 502 });
  }
}

// DELETE { cook: uri } — take kudos back. None given → nothing to do.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cook = (await readJson(request))?.cook;
  if (typeof cook !== "string") return NextResponse.json({ error: "Invalid cook" }, { status: 400 });

  const db = getDb();
  const uri = await getKudosUri(session.did, cook, db);
  if (!uri) return NextResponse.json({ deleted: null });

  try {
    await deleteOwnRecord(new Client(session), db, "kudos", uri);
    return NextResponse.json({ deleted: uri });
  } catch (err) {
    console.error("kudos delete failed", err);
    return NextResponse.json({ error: "Removing kudos failed on your PDS" }, { status: 502 });
  }
}
