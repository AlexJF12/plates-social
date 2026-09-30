import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { isValidTid } from "@atproto/syntax";
import { getSession } from "@/lib/auth/session";
import { COLLECTIONS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { type CommentView, getAccount, getComments, getVisibleCook } from "@/lib/db/queries";
import { isOwnRecordUri, readJson } from "@/lib/http";
import { commentRecord, createComment, deleteOwnRecord } from "@/lib/social/write";

// GET /api/comment?cook=uri&cursor=… — next page of a cook's comments.
// Public index data, like /api/feed.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cookUri = params.get("cook");
  if (!cookUri) return NextResponse.json({ error: "Invalid cook" }, { status: 400 });
  const page = await getComments({ cookUri, cursor: params.get("cursor") });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

// POST { cook: uri, text, rkey: tid } — comment on a visible cook. Returns
// the new comment so the page can show it straight away.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const rkey = body?.rkey;
  if (typeof rkey !== "string" || !isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }
  const db = getDb();
  const target = typeof body?.cook === "string" ? await getVisibleCook(body.cook, db) : null;
  if (!target) return NextResponse.json({ error: "Cook not found" }, { status: 404 });

  // Enforce every §4 limit before anything reaches the PDS.
  let record;
  try {
    record = commentRecord({ uri: target.uri, cid: target.cid }, typeof body?.text === "string" ? body.text : "");
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid comment: ${err instanceof Error ? err.message : err}` },
      { status: 400 },
    );
  }

  let uri: string;
  try {
    ({ uri, record } = await createComment(new Client(session), db, session.did, record, rkey));
  } catch (err) {
    console.error("comment failed", err);
    return NextResponse.json({ error: "Posting your comment failed on your PDS" }, { status: 502 });
  }

  const author = (await getAccount(session.did, db).catch(() => null)) ?? {
    did: session.did,
    handle: null,
    displayName: null,
    avatarCid: null,
  };
  const view: CommentView = { uri, author, text: record.text, sortAt: record.createdAt };
  return NextResponse.json(view);
}

// DELETE { uri } — delete one of your own comments (§6.6).
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uri = (await readJson(request))?.uri;
  if (!isOwnRecordUri(uri, session.did, COLLECTIONS.comment)) {
    return NextResponse.json({ error: "Invalid uri" }, { status: 400 });
  }
  try {
    await deleteOwnRecord(new Client(session), getDb(), "comment", uri);
    return NextResponse.json({ deleted: uri });
  } catch (err) {
    console.error("comment delete failed", err);
    return NextResponse.json({ error: "Deleting your comment failed on your PDS" }, { status: 502 });
  }
}
