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
    { label: "this week", value: stats?.week },
    { label: "this month", value: stats?.month },
  ];

  // Strava-style figures: big serif numbers, a small label underneath.
  return (
    <dl className="flex px-4 pb-5" data-testid="profile-stats">
      {items.map((s, i) => (
        <div key={s.label} className={`flex flex-1 flex-col-reverse ${i > 0 ? "border-l border-border pl-5" : ""}`}>
          <dt className="mt-1.5 text-small text-muted">
            {s.value === 1 ? "cook" : "cooks"} {s.label}
          </dt>
          <dd className="font-display text-stat tabular-nums">{s.value ?? <span className="text-muted">–</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
