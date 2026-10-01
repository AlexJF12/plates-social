import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_URL, getOAuthClient } from "@/lib/auth/client";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  encodeSessionCookie,
  getSessionSecret,
} from "@/lib/auth/cookie";
import { getDb } from "@/lib/db";
import { safeNext } from "@/lib/links";
import { getTap } from "@/lib/tap";

export async function GET(request: NextRequest) {
  let did: string;
  let next: string | null = null;
  try {
    const client = await getOAuthClient();
    // Exchanges the code for tokens and stores them in auth_session.
    const { session, state } = await client.callback(request.nextUrl.searchParams);
    did = session.did;
    next = safeNext(state);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=login_failed", PUBLIC_URL));
  }

  // Tap's signal collection only discovers accounts that have posted a cook,
  // so register every signed-in user explicitly (§5, §6.1). Not fatal: Tap
  // being down shouldn't block sign-in, and it's retried on the next login.
  try {
    await getTap().addRepos([did]);
  } catch (error) {
    console.error(`Tap addRepos failed for ${did}:`, error);
  }

  // First sign-in → offer the Bluesky import once (§6.3), even when sign-in
  // started from a shared cook (`next`). Otherwise go back to `next`. If recording it
  // fails, fall through to the normal landing rather than failing sign-in.
  let firstLogin = false;
  try {
    const inserted = await getDb()
      .insertInto("login")
      .values({ did })
      .onConflict((oc) => oc.column("did").doNothing())
      .executeTakeFirst();
    firstLogin = Number(inserted.numInsertedOrUpdatedRows) > 0;
  } catch (error) {
    console.error(`recording first login failed for ${did}:`, error);
  }

  const response = NextResponse.redirect(
    new URL(firstLogin ? "/import?first=1" : (next ?? "/"), PUBLIC_URL),
  );
  response.cookies.set(
    SESSION_COOKIE,
    encodeSessionCookie(did, getSessionSecret()),
    {
      httpOnly: true,
      secure: PUBLIC_URL.startsWith("https://"),
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    },
  );
  return response;
}
