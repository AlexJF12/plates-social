"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { TID } from "@atproto/common-web";
import type { Author } from "@/lib/db/queries";
import { displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";

// Kudos on a cook: the count, who gave them, and the viewer's toggle (§6.6).
// Like FollowButton, the toggle only flips once the server confirms the
// write reached the PDS. No toggle on your own cook.
export function CookKudos({
  cookUri,
  viewer,
  initialGiven,
  initialKudos,
  canGive,
}: {
  cookUri: string;
  viewer: Author;
  initialGiven: boolean;
  initialKudos: Author[];
  canGive: boolean;
}) {
  const [given, setGiven] = useState(initialGiven);
  const [kudos, setKudos] = useState(initialKudos);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused if giving kudos is retried, so a lost response can't create a
  // second record (see /api/kudos).
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
      setKudos((prev) => (given ? prev.filter((k) => k.did !== viewer.did) : [...prev, viewer]));
      setGiven(!given);
    } catch {
      setError(given ? "Couldn't remove your kudos. Try again." : "Couldn't give kudos. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6 border-t border-border px-4 pt-4" aria-labelledby="kudos-h">
      <div className="flex items-center justify-between gap-3">
        <h3 id="kudos-h" className="text-sm font-semibold" data-testid="kudos-count">
          {kudos.length} kudos
        </h3>
        {canGive && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={given}
            className={`h-11 min-w-32 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 ${
              given ? "border border-accent text-accent" : "bg-accent text-accent-foreground"
            }`}
          >
            {pending ? "Saving…" : given ? "Kudos given" : "Give kudos"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {kudos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {kudos.map((k) => (
            <li key={k.did}>
              <Link href={profilePath(k)} title={displayName(k)} aria-label={displayName(k)}>
                <Avatar author={k} size={28} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
