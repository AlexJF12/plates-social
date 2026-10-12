"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CookView, FeedPage } from "@/lib/db/queries";
import { CookCard } from "./CookCard";
import { PullToRefresh } from "./PullToRefresh";
import { button } from "./ui";

// Infinite scroll over /api/feed (§6.2), or another endpoint that pages the
// same way (`api` + `params`, e.g. /api/search). The first page is rendered
// on the server (or fetched by the parent) and passed in; later pages load
// as the sentinel nears the viewport. Pulling down at the top reloads the
// first page (PullToRefresh).
export function CookFeed({
  initial,
  viewerDid,
  author,
  following = false,
  api = "/api/feed",
  params,
  refreshable = true,
  empty,
}: {
  initial: FeedPage;
  viewerDid: string;
  author?: string;
  following?: boolean;
  api?: string;
  params?: Record<string, string>;
  // Pull to refresh (feeds and profiles; search results opt out).
  refreshable?: boolean;
  empty: React.ReactNode;
}) {
  const [items, setItems] = useState<CookView[]>(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (after: string | null): Promise<FeedPage> => {
      const qs = new URLSearchParams({
        ...(after ? { cursor: after } : {}),
        ...(author ? { author } : {}),
        ...(following ? { feed: "following" } : {}),
        ...params,
      });
      const res = await fetch(`${api}?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    [api, params, author, following],
  );

  // Pull to refresh: the first page again, replacing the list (old items stay
  // until it arrives); infinite scroll re-arms from the new cursor.
  const refresh = useCallback(async () => {
    const page = await fetchPage(null);
    setItems(page.items);
    setCursor(page.cursor);
    setState("idle");
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor || state === "loading") return;
    setState("loading");
    try {
      const page = await fetchPage(cursor);
      // A cook indexed between page loads can shift items; skip repeats.
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.uri));
        return [...prev, ...page.items.filter((c) => !seen.has(c.uri))];
      });
      setCursor(page.cursor);
      setState("idle");
    } catch {
      setState("error");
    }
  }, [fetchPage, cursor, state]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || state !== "idle") return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, state, loadMore]);

  const Wrap = refreshable ? PullToRefresh : NoRefresh;
  if (items.length === 0) return <Wrap onRefresh={refresh}>{empty}</Wrap>;

  return (
    <Wrap onRefresh={refresh}>
      {items.map((c) => (
        <CookCard key={c.uri} cook={c} viewerDid={viewerDid} />
      ))}
      <div ref={sentinel} className="flex min-h-20 items-center justify-center py-6 text-small text-muted">
        {state === "loading" && "Loading…"}
        {state === "error" && (
          <button type="button" onClick={loadMore} className={button({ variant: "quiet" })}>
            Couldn&apos;t load more. Retry
          </button>
        )}
        {!cursor && items.length > 3 && "You're all caught up."}
      </div>
    </Wrap>
  );
}

const NoRefresh = ({ children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) => <div>{children}</div>;
