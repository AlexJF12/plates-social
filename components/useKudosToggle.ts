"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { TID } from "@atproto/common-web";

// The viewer's kudos toggle (§6.6), shared by feed cards and the cook page.
// It only flips once the server confirms the write reached the PDS, and
// reuses the client rkey across retries so a lost response can't create a
// second record (see /api/kudos).
//
// Confirmed changes are also kept here, per cook, for the life of the app.
// A page restored from the router cache on Back still has the props it was
// first rendered with; this lets every card and page show the latest state
// anyway.
const confirmed = new Map<string, boolean>();
const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useKudosToggle(cookUri: string, serverGiven: boolean) {
  const known = useSyncExternalStore(
    subscribe,
    () => confirmed.get(cookUri),
    () => undefined,
  );
  const given = known ?? serverGiven;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rkey = useRef<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = given
        ? await fetch("/api/kudos", { method: "DELETE", body: JSON.stringify({ cook: cookUri }) })
        : await fetch("/api/kudos", {
            method: "POST",
            body: JSON.stringify({ cook: cookUri, rkey: (rkey.current ??= TID.nextStr()) }),
          });
      if (!res.ok) throw new Error(String(res.status));
      rkey.current = null;
      confirmed.set(cookUri, !given);
      listeners.forEach((l) => l());
    } catch {
      setError(given ? "Couldn't remove your kudos. Try again." : "Couldn't give kudos. Try again.");
    } finally {
      setPending(false);
    }
  }

  // How the viewer's kudos changes the server's count (and kudos list).
  const delta = given === serverGiven ? 0 : given ? 1 : -1;
  return { given, delta, pending, error, toggle };
}
