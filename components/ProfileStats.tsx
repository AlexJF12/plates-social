"use client";

import { useSyncExternalStore } from "react";
import { countStats, type DayCount, todayIn } from "@/lib/cook/stats";

// An installed app can sit in the background across midnight: re-read
// "today" whenever it comes back to the foreground.
function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getToday = () => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
// The server doesn't know the viewer's zone, so it renders a placeholder.
const getServerToday = () => null;

// Cooks this week / this month (§6.4), in the viewer's calendar. `days` are
// per-day counts from getCookDayCounts over statsWindow().
export function ProfileStats({ days }: { days: DayCount[] }) {
  const today = useSyncExternalStore(subscribe, getToday, getServerToday);
  const stats = today ? countStats(days, today) : null;
  const items = [
    { label: "This week", value: stats?.week },
    { label: "This month", value: stats?.month },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 px-4 pb-4" data-testid="profile-stats">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-surface px-4 py-3">
          <dt className="text-xs font-medium text-muted">{s.label}</dt>
          <dd className="mt-0.5 text-2xl font-bold tabular-nums">
            {s.value ?? <span className="text-muted">–</span>}
            <span className="sr-only"> {s.value === 1 ? "cook" : "cooks"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
