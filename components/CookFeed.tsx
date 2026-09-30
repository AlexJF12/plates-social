"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CookView, FeedPage } from "@/lib/db/queries";
import { CookCard } from "./CookCard";

// Infinite scroll over /api/feed (§6.2). The first page is rendered on the
// server and passed in; later pages load as the sentinel nears the viewport.
export function CookFeed({
  initial,
  author,
  following = false,
  empty,
}: {
  initial: FeedPage;
  author?: string;
  following?: boolean;
  empty: React.ReactNode;
}) {
  const [items, setItems] = useState<CookView[]>(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || state === "loading") return;
    setState("loading");
    try {
      const qs = new URLSearchParams({
        cursor,
        ...(author ? { author } : {}),
        ...(following ? { feed: "following" } : {}),
      });
      const res = await fetch(`/api/feed?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const page: FeedPage = await res.json();
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
  }, [author, following, cursor, state]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || state !== "idle") return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, state, loadMore]);

  if (items.length === 0) return <>{empty}</>;

  return (
    <div>
      {items.map((c) => (
        <CookCard key={c.uri} cook={c} />
      ))}
      <div ref={sentinel} className="flex min-h-16 items-center justify-center py-4 text-sm text-muted">
        {state === "loading" && "Loading…"}
        {state === "error" && (
          <button type="button" onClick={loadMore} className="h-11 px-4 text-accent">
            Couldn&apos;t load more. Retry
          </button>
        )}
        {!cursor && items.length > 3 && "That's everything."}
      </div>
    </div>
  );
}
