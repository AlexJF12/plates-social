"use client";

import { Plus, Rows3, Search, Trophy, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FEEDS, type FeedPath, LAST_FEED_KEY, isFeedPath } from "@/lib/feeds";
import { useViewerToday } from "./useViewerToday";

// Bottom tabs (§7): Feed, Search, Log (primary, in the middle), Best,
// Profile. Feed opens whichever feed (Following or Global) you last used;
// the switch between them is in the feed header. Best opens the viewer's
// current month (before hydration, /best resolves it). Padded clear of the
// home indicator (§7.1).
export function TabBar({ profileHrefs }: { profileHrefs: string[] }) {
  const path = usePathname();
  const [feedHref, setFeedHref] = useState<FeedPath>(FEEDS[0].href);
  const today = useViewerToday();

  // Remember the feed you're on; storage can be unavailable (private mode),
  // then Feed just opens Following.
  useEffect(() => {
    try {
      if (isFeedPath(path)) localStorage.setItem(LAST_FEED_KEY, path);
      const last = localStorage.getItem(LAST_FEED_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (isFeedPath(last)) setFeedHref(last);
    } catch {}
  }, [path]);

  const tabs = [
    { href: feedHref, label: "Feed", Icon: Rows3, active: isFeedPath(path) },
    { href: "/search", label: "Search", Icon: Search, active: path === "/search" },
    { href: "/log", label: "Log", Icon: Plus, primary: true, active: path === "/log" },
    { href: today ? `/best/${today.slice(0, 7)}` : "/best", label: "Best", Icon: Trophy, active: path.startsWith("/best") },
    { href: profileHrefs[0], label: "Profile", Icon: User, active: profileHrefs.includes(decodeURIComponent(path)) },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/90 pb-safe backdrop-blur-md">
      <ul className="mx-auto flex h-16 max-w-md items-stretch px-1">
        {tabs.map(({ href, label, Icon, primary, active }) => (
          <li key={label} className="flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-caption font-medium transition-opacity active:opacity-60 ${
                active ? "text-foreground" : "text-muted"
              }`}
            >
              {primary ? (
                <span className="flex h-8 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon size={22} strokeWidth={2.4} aria-hidden />
                </span>
              ) : (
                <span className="flex h-8 items-center">
                  <Icon size={24} strokeWidth={active ? 2.3 : 1.7} aria-hidden />
                </span>
              )}
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
