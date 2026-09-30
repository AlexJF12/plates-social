// The two feeds behind the Feed tab (§7). Plain module: used by the tab bar
// (client) and the feed header (server).
export const FEEDS = [
  { href: "/following", label: "Following" },
  { href: "/global", label: "Global" },
] as const;

export type FeedPath = (typeof FEEDS)[number]["href"];

// localStorage key: the feed the Feed tab reopens.
export const LAST_FEED_KEY = "lastFeed";

export const isFeedPath = (p: string | null): p is FeedPath => FEEDS.some((f) => f.href === p);
