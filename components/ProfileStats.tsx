"use client";

import { UtensilsCrossed } from "lucide-react";
import { countStats, type DayCount } from "@/lib/cook/stats";
import { useViewerToday } from "./useViewerToday";

// Cooks this week / this month (§6.4), in the viewer's calendar. `days` are
// per-day counts from getCookDayCounts over statsWindow(); `visitDays` the
// same for visits (getVisitDayCounts), shown as one smaller eating-out line
// under the figures, only when either count is above zero (Phase 6.8).
export function ProfileStats({ days, visitDays }: { days: DayCount[]; visitDays: DayCount[] }) {
  const today = useViewerToday();
  const stats = today ? countStats(days, today) : null;
  const out = today ? countStats(visitDays, today) : null;
  const items = [
    { label: "this week", value: stats?.week },
    { label: "this month", value: stats?.month },
  ];

  // Strava-style figures: big serif numbers, a small label underneath.
  return (
    <div className="px-4 pb-5">
      <dl className="flex" data-testid="profile-stats">
        {items.map((s, i) => (
          <div key={s.label} className={`flex flex-1 flex-col-reverse ${i > 0 ? "border-l border-border pl-5" : ""}`}>
            <dt className="mt-1.5 text-small text-muted">
              {s.value === 1 ? "cook" : "cooks"} {s.label}
            </dt>
            <dd className="font-display text-stat tabular-nums">{s.value ?? <span className="text-muted">–</span>}</dd>
          </div>
        ))}
      </dl>
      {out && (out.week > 0 || out.month > 0) && (
        <p className="mt-3 flex items-center gap-2 text-small text-muted" data-testid="eating-out">
          <UtensilsCrossed size={16} strokeWidth={2} className="shrink-0 text-out" aria-hidden />
          Ate out {out.week} this week · {out.month} this month
        </p>
      )}
    </div>
  );
}
