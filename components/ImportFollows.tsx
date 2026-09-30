"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Author } from "@/lib/db/queries";
import { displayName } from "@/lib/links";
import { Avatar } from "./Avatar";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; candidates: Author[] };

// People you follow on Bluesky who cook here, all pre-selected, one button
// to follow them (§6.3). Loaded client-side: reading someone's Bluesky
// follows can take a few seconds, and this way there's a loading state and
// a retry. On the first-login visit an empty list skips straight to Global.
export function ImportFollows({ first }: { first: boolean }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submit, setSubmit] = useState<{ state: "idle" | "saving" } | { state: "error"; message: string }>({
    state: "idle",
  });

  const fetchCandidates = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const res = await fetch("/api/follow/import");
      if (!res.ok) throw new Error(String(res.status));
      const { candidates }: { candidates: Author[] } = await res.json();
      if (candidates.length === 0 && first) {
        router.replace("/global");
        return;
      }
      setSelected(new Set(candidates.map((c) => c.did)));
      setLoad({ state: "ready", candidates });
    } catch {
      setLoad({ state: "error" });
    }
  }, [first, router]);

  useEffect(() => {
    // Data fetch on mount; the state updates happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCandidates();
  }, [fetchCandidates]);

  async function followSelected() {
    setSubmit({ state: "saving" });
    try {
      const res = await fetch("/api/follow/import", {
        method: "POST",
        body: JSON.stringify({ subjects: [...selected] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Batches that landed stay followed; a retry only sends the rest.
        const message =
          typeof body.followed === "number" && body.followed > 0
            ? `Followed ${body.followed}, but the rest didn't go through.`
            : "Couldn't follow them.";
        setSubmit({ state: "error", message });
        return;
      }
      router.replace("/following");
      router.refresh();
    } catch {
      setSubmit({ state: "error", message: "Couldn't follow them." });
    }
  }

  const skipHref = first ? "/global" : null;

  if (load.state === "loading") {
    return <p className="px-6 py-16 text-center text-sm text-muted">Looking up who you follow on Bluesky…</p>;
  }
  if (load.state === "error") {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-semibold">Couldn&apos;t load your Bluesky follows</p>
        <button type="button" onClick={fetchCandidates} className="mt-3 h-11 px-4 font-medium text-accent">
          Retry
        </button>
      </div>
    );
  }
  if (load.candidates.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-semibold">No one new to follow</p>
        <p className="mt-1 text-sm text-muted">
          Nobody you follow on Bluesky has logged a cook here yet, or you already follow them.
        </p>
        <Link href="/global" className="mt-4 inline-flex h-11 items-center px-5 font-medium text-accent">
          Browse the global feed
        </Link>
      </div>
    );
  }

  const { candidates } = load;
  const all = selected.size === candidates.length;
  const saving = submit.state === "saving";
  const toggle = (did: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(did)) next.add(did);
      return next;
    });

  return (
    <>
      <p className="px-4 pt-4 pb-2 text-sm text-muted">
        {candidates.length === 1 ? "1 person" : `${candidates.length} people`} you follow on Bluesky{" "}
        {candidates.length === 1 ? "cooks" : "cook"} here.
      </p>
      <ul>
        {candidates.map((c) => (
          <li key={c.did}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
              <Avatar author={c} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{displayName(c)}</span>
                {c.handle && <span className="block truncate text-sm text-muted">@{c.handle}</span>}
              </span>
              <input
                type="checkbox"
                checked={selected.has(c.did)}
                onChange={() => toggle(c.did)}
                disabled={saving}
                className="h-5 w-5 shrink-0 accent-accent"
                aria-label={`Follow ${displayName(c)}`}
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        {submit.state === "error" && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {submit.message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={followSelected}
            disabled={saving || selected.size === 0}
            className="h-11 flex-1 rounded-lg bg-accent px-5 font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving
              ? "Following…"
              : submit.state === "error"
                ? "Retry"
                : all
                  ? "Follow all"
                  : `Follow ${selected.size}`}
          </button>
          {skipHref && (
            <Link href={skipHref} className="flex h-11 items-center px-4 font-medium text-muted">
              Skip
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
