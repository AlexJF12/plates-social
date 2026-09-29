import { NextResponse } from "next/server";
import { JoseKey } from "@atproto/oauth-client-node";

// Public half of PRIVATE_KEY, used by the authorization server to verify our
// client assertions. Empty in loopback mode.
export async function GET() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return NextResponse.json({ keys: [] });
  const key = await JoseKey.fromJWK(JSON.parse(privateKey));
  return NextResponse.json({ keys: [key.publicJwk] });
}
