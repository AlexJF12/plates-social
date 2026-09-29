import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_URL, getOAuthClient } from "@/lib/auth/client";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  encodeSessionCookie,
  getSessionSecret,
} from "@/lib/auth/cookie";
import { getTap } from "@/lib/tap";

export async function GET(request: NextRequest) {
  let did: string;
  try {
    const client = await getOAuthClient();
    // Exchanges the code for tokens and stores them in auth_session.
    const { session } = await client.callback(request.nextUrl.searchParams);
    did = session.did;
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

  const response = NextResponse.redirect(new URL("/", PUBLIC_URL));
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
