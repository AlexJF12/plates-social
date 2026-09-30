"use client";

import { useRef, useState } from "react";
import { TID } from "@atproto/common-web";

// Follow / unfollow on a profile (§6.3). The button only flips once the
// server confirms the write reached the PDS (§7: failed writes must never
// look like they succeeded).
export function FollowButton({ subject, initialFollowing }: { subject: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused if a follow is retried, so a lost response can't create a
  // second record (see /api/follow).
  const rkey = useRef<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = following
        ? await fetch("/api/follow", { method: "DELETE", body: JSON.stringify({ subject }) })
        : await fetch("/api/follow", {
            method: "POST",
            body: JSON.stringify({ subject, rkey: (rkey.current ??= TID.nextStr()) }),
          });
      if (!res.ok) throw new Error(String(res.status));
      rkey.current = null;
      setFollowing(!following);
    } catch {
      setError(following ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`h-11 min-w-28 rounded-lg px-5 text-sm font-semibold disabled:opacity-60 ${
          following ? "border border-border" : "bg-accent text-accent-foreground"
        }`}
      >
        {pending ? "Saving…" : following ? "Following" : "Follow"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
