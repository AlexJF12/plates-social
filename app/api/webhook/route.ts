import { NextRequest, NextResponse } from "next/server";
import { jsonToLex } from "@atproto/lex";
import { assureAdminAuth, parseTapEvent } from "@atproto/tap";
import type { TapEvent } from "@atproto/tap";
import { getDb } from "@/lib/db";
import { indexEvent } from "@/lib/indexer";

// Tap delivers every event here (webhook mode, §6.1) and treats a 200 as
// the ack. Anything else makes Tap retry, so:
// - a record we reject (bad Lexicon, broken rule) still gets a 200, or Tap
//   would retry it forever;
// - a database error gets a 500, so the event is redelivered later.
export async function POST(request: NextRequest) {
  const password = process.env.TAP_ADMIN_PASSWORD;
  if (!password) {
    console.error("webhook: TAP_ADMIN_PASSWORD is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  try {
    assureAdminAuth(password, request.headers.get("authorization") ?? "");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let evt: TapEvent;
  try {
    // Records arrive as JSON (CIDs as {"$link"}); $parse wants lex values.
    evt = parseTapEvent(jsonToLex(await request.json()));
  } catch (err) {
    console.warn("webhook: unparseable event dropped", err);
    return NextResponse.json({ ok: false, dropped: "unparseable event" });
  }

  try {
    const outcome = await indexEvent(getDb(), evt);
    if (outcome.kind === "dropped") {
      const what =
        evt.type === "record" ? `at://${evt.did}/${evt.collection}/${evt.rkey}` : evt.did;
      console.warn(`webhook: dropped ${what}: ${outcome.reason}`);
    }
    return NextResponse.json({ ok: true, outcome: outcome.kind });
  } catch (err) {
    console.error(`webhook: event ${evt.id} failed`, err);
    return NextResponse.json({ error: "Indexing failed" }, { status: 500 });
  }
}
