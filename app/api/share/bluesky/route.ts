import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { AtUri, isValidTid } from "@atproto/syntax";
import { PUBLIC_URL } from "@/lib/auth/client";
import { getSession } from "@/lib/auth/session";
import { getVisiblePost } from "@/lib/db/queries";
import { readJson } from "@/lib/http";
import { cookShareUrl, visitShareUrl } from "@/lib/share";
import { createBskyPost, hasBskyPostScope } from "@/lib/social/bluesky";

// POST { cook: uri, rkey: tid } — post your own cook or visit to Bluesky
// (`cook` is either uri).
// 403 { reauth: true } when this session predates the Bluesky post scope.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJson(request);
  const rkey = body?.rkey;
  if (typeof rkey !== "string" || !isValidTid(rkey)) {
    return NextResponse.json({ error: "Invalid rkey" }, { status: 400 });
  }
  const target = typeof body?.cook === "string" ? await getVisiblePost(body.cook) : null;
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.authorDid !== session.did) {
    return NextResponse.json({ error: `You can only post your own ${target.kind}s to Bluesky` }, { status: 403 });
  }

  const { scope } = await session.getTokenInfo(false);
  if (!hasBskyPostScope(scope)) {
    return NextResponse.json(
      { error: "Sign in again to allow posting to Bluesky", reauth: true },
      { status: 403 },
    );
  }

  const subject = { kind: target.kind, rkey: new AtUri(target.uri).rkey };
  const shareUrl = target.kind === "visit" ? visitShareUrl : cookShareUrl;
  try {
    const post = await createBskyPost(
      new Client(session),
      session.did,
      subject,
      rkey,
      shareUrl(PUBLIC_URL, session.did, subject.rkey),
    );
    return NextResponse.json(post);
  } catch (err) {
    console.error("bluesky share failed", err);
    return NextResponse.json({ error: "Posting to Bluesky failed on your PDS" }, { status: 502 });
  }
}
