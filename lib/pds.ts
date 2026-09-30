import { getPdsEndpoint } from "@atproto/common-web";
import { getTap } from "./tap";

// The PDS URL comes from the account's DID document, which they control.
// Only fetch from public https hosts so it can't be pointed at our network.
export function safePdsUrl(endpoint: string | undefined): URL | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    const isIpLiteral = /^[\d.]+$/.test(host) || host.startsWith("[");
    if (url.protocol !== "https:" || isIpLiteral || host === "localhost" || host.endsWith(".local")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

// PDS for a DID via Tap's identity cache, or null if it has no usable one.
export async function resolvePds(did: string): Promise<URL | null> {
  const doc = await getTap().resolveDid(did);
  return safePdsUrl(doc ? getPdsEndpoint(doc) : undefined);
}
