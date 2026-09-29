import { JoseKey } from "@atproto/oauth-client-node";

// Prints a private ES256 JWK for PRIVATE_KEY (confidential client mode).
async function main() {
  const key = await JoseKey.generate(["ES256"], Date.now().toString());
  console.log(JSON.stringify(key.privateJwk));
}

main();
