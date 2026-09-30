"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type Month, addMonths, formatMonth, latestCompletedMonth } from "@/lib/cook/best";
import { useViewerToday } from "./useViewerToday";

const arrow =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-sunken aria-disabled:pointer-events-none aria-disabled:opacity-30";

// Sticky month switcher for the Best tab: ‹ September 2026 ›. Previous stops
// at the earliest month with any cook; Next stops at the viewer's current
// month (known only in the browser; until then, at the last month that has
// started everywhere). The status line says whether leaders can still change.
export function BestHeader({ month, earliest }: { month: Month; earliest: Month | null }) {
  const today = useViewerToday();
  const current = today?.slice(0, 7) ?? addMonths(latestCompletedMonth(), 1);
  const prev = earliest && month > earliest ? addMonths(month, -1) : null;
  const next = month < current ? addMonths(month, 1) : null;

  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
      <nav aria-label="Month" className="mx-auto flex h-14 max-w-md items-center gap-1 px-2">
        <MonthLink href={prev} label="Previous month" Icon={ChevronLeft} />
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-dish">{formatMonth(month)}</h1>
        <MonthLink href={next} label="Next month" Icon={ChevronRight} />
      </nav>
    </header>
  );
}

// Whether `month` is still running for this viewer ("Leading so far").
export function BestStatus({ month }: { month: Month }) {
  const today = useViewerToday();
  const running = today ? month >= today.slice(0, 7) : month > latestCompletedMonth();
  return (
    <p className="px-4 pt-1 pb-3 text-small text-pretty text-muted" data-testid="best-status">
      {running
        ? "Leading so far. The cook with the most kudos in each meal wins when the month ends."
        : "The cook with the most kudos in each meal."}
    </p>
  );
}

function MonthLink({ href, label, Icon }: { href: string | null; label: string; Icon: typeof ChevronLeft }) {
  const icon = <Icon size={26} strokeWidth={2} aria-hidden />;
  if (!href) {
    return (
      <span className={arrow} aria-disabled="true" aria-label={label} role="link">
        {icon}
      </span>
    );
  }
  return (
    <Link href={`/best/${href}`} className={arrow} aria-label={label}>
      {icon}
    </Link>
  );
}
