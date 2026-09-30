"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Author } from "@/lib/db/queries";
import { displayName } from "@/lib/links";
import { Avatar } from "./Avatar";
import { EmptyState, ErrorText, button } from "./ui";

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
    return (
      <div aria-busy="true">
        <p className="px-4 pt-2 pb-3 text-body text-muted">Looking up who you follow on Bluesky…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2">
            <span className="h-11 w-11 rounded-full bg-border motion-safe:animate-pulse" />
            <span className="h-4 w-40 rounded bg-border motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <EmptyState
        title="Couldn't load your Bluesky follows"
        actions={
          <button type="button" onClick={fetchCandidates} className={button()}>
            Try again
          </button>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    );
  }
  if (load.candidates.length === 0) {
    return (
      <EmptyState
        title="No one new to follow"
        actions={
          <Link href="/global" className={button({ variant: "secondary" })}>
            Browse the global feed
          </Link>
        }
      >
        Nobody you follow on Bluesky has logged a cook here yet, or you already follow them.
      </EmptyState>
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
      <p className="px-4 pt-2 pb-3 text-body text-pretty text-muted">
        {candidates.length === 1 ? "1 person" : `${candidates.length} people`} you follow on Bluesky{" "}
        {candidates.length === 1 ? "cooks" : "cook"} here.
      </p>
      <ul>
        {candidates.map((c) => (
          <li key={c.did}>
            <label className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-2 active:bg-sunken">
              <Avatar author={c} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{displayName(c)}</span>
                {c.handle && <span className="block truncate text-small text-muted">@{c.handle}</span>}
              </span>
              <input
                type="checkbox"
                checked={selected.has(c.did)}
                onChange={() => toggle(c.did)}
                disabled={saving}
                className="h-6 w-6 shrink-0 accent-accent"
                aria-label={`Follow ${displayName(c)}`}
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md">
        {submit.state === "error" && <ErrorText className="mb-2">{submit.message}</ErrorText>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={followSelected}
            disabled={saving || selected.size === 0}
            className={`${button()} flex-1`}
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
            <Link href={skipHref} className={button({ variant: "subtle" })}>
              Skip
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
