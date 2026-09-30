import type { NextRequest } from "next/server";
import { AtUri, isValidTid } from "@atproto/syntax";

// A JSON object body, or null if the body isn't one.
export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// An at:// uri of a record in `did`'s own repo, in `collection`, with a TID
// rkey. Deletes only ever target these.
export function isOwnRecordUri(uri: unknown, did: string, collection: string): uri is string {
  if (typeof uri !== "string") return false;
  try {
    const u = new AtUri(uri);
    return isValidTid(u.rkey) && AtUri.make(did, collection, u.rkey).toString() === uri;
  } catch {
    return false;
  }
}
