import type { NextConfig } from "next";

// The dev server only accepts its own hostname by default. Allow 127.0.0.1
// (the loopback OAuth redirect target) and the tunnel host when PUBLIC_URL
// points at one.
const devOrigins = ["127.0.0.1"];
if (process.env.PUBLIC_URL) devOrigins.push(new URL(process.env.PUBLIC_URL).hostname);

const nextConfig: NextConfig = {
  // As in the Statusphere example: keep Tap's logger out of the bundle.
  serverExternalPackages: ["@atproto/tap", "thread-stream", "pino"],
  allowedDevOrigins: devOrigins,
  // Browsers should always fetch the latest service worker (§7.1).
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default nextConfig;
