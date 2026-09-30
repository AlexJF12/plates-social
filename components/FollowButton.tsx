"use client";

import { useRef, useState } from "react";
import { TID } from "@atproto/common-web";
import { ErrorText, button } from "./ui";

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
    <div className="w-full">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        className={button({ variant: following ? "selected" : "primary", full: true })}
      >
        {pending ? "Saving…" : following ? "Following" : "Follow"}
      </button>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
