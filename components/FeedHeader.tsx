import Link from "next/link";
import { FEEDS, type FeedPath } from "@/lib/feeds";

// Sticky header for the Feed tab: a two-segment switch between Following and
// Global. They stay separate pages (/following, /global), so each segment is
// a plain link.
export function FeedHeader({ current }: { current: FeedPath }) {
  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-md px-4 py-2">
        <nav aria-label="Feeds" className="grid grid-cols-2 rounded-full bg-sunken p-0.5">
          {FEEDS.map((f) => {
            const active = f.href === current;
            return (
              <Link
                key={f.href}
                href={f.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center justify-center rounded-full text-body font-semibold transition-colors duration-150 ${
                  active ? "bg-surface text-foreground" : "text-muted active:text-foreground"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {/* The page's name for screen readers; the switch shows it visually. */}
      <h1 className="sr-only">{FEEDS.find((f) => f.href === current)?.label}</h1>
    </header>
  );
}
