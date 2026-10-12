import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";
import { SCOPE } from "@/lib/config";
import { safeNext } from "@/lib/links";

export async function POST(request: NextRequest) {
  let handle: unknown;
  let next: unknown;
  try {
    ({ handle, next } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof handle !== "string" || !handle.trim()) {
    return NextResponse.json({ error: "Handle is required" }, { status: 400 });
  }

  try {
    const client = await getOAuthClient();
    // Resolves handle (or DID, when signing in again) → DID → PDS →
    // authorization server. `state` carries where to land afterwards; the
    // client stores it server-side and hands it back in the callback.
    const authUrl = await client.authorize(
      handle.trim().replace(/^@/, "").toLowerCase(),
      { scope: SCOPE, state: safeNext(next) ?? undefined },
    );
    return NextResponse.json({ redirectUrl: authUrl.toString() });
  } catch (error) {
    console.error("OAuth login error:", error);
    return NextResponse.json(
      { error: "Couldn't start sign-in. Check the handle and try again." },
      { status: 400 },
    );
  }
}
