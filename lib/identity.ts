import { getHandle } from "@atproto/common-web";
import { getTap } from "./tap";

// Handle for a DID via Tap's identity cache (Statusphere pattern). Falls back
// to the DID if Tap is unreachable or the document has no valid handle.
export async function resolveHandle(did: string): Promise<string> {
  try {
    const doc = await getTap().resolveDid(did);
    return (doc && getHandle(doc)) || did;
  } catch {
    return did;
  }
}
