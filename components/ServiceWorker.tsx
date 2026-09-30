"use client";

import { useEffect } from "react";

// Registers public/sw.js (offline fallback only, §7.1). updateViaCache
// "none" makes the browser check for a new sw.js on every load instead of
// trusting its HTTP cache.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("Service worker registration failed:", err));
  }, []);
  return null;
}
