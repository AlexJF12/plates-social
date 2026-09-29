import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth/client";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { getDid } from "@/lib/auth/session";

export async function POST() {
  const did = await getDid();
  if (did) {
    try {
      // Revokes tokens at the PDS and deletes the auth_session row.
      await (await getOAuthClient()).revoke(did);
    } catch (error) {
      console.error("Logout revoke error:", error);
    }
  }
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
