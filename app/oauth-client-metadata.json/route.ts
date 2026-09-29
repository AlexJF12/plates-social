import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

// In confidential-client mode this URL *is* the client_id: the user's
// authorization server fetches it to learn our redirect URIs, scopes and keys.
export async function GET() {
  const client = await getOAuthClient();
  return NextResponse.json(client.clientMetadata);
}
