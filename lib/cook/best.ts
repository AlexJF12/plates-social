// Best cook (Phase 6.6): per calendar month and meal type, the cook with the
// most kudos. Months are 'YYYY-MM' in the author's own calendar
// (cookedLocalDate, as for the stats in §6.4). Client-safe: no DB here; the
// query is getBestCooks in lib/db/queries.ts.

import { mealTypeLabel } from "./mealTypes";

export type Month = string;

export type Badge = { mealType: string; month: Month };

export const isMonth = (s: unknown): s is Month =>
  typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// [from, to) as 'YYYY-MM-DD', for a cookedLocalDate range.
export const monthRange = (month: Month) => ({ from: `${month}-01`, to: `${addMonths(month, 1)}-01` });

const HOUR = 3_600_000;
const monthAt = (ms: number) => new Date(ms).toISOString().slice(0, 7);

// Time zones run from UTC−12 to UTC+14. A month has ended everywhere once
// it has ended at UTC−12; badges are only shown for those months, so a
// current month's shifting leaders never flicker on cards.
export const latestCompletedMonth = (now: Date = new Date()) => addMonths(monthAt(now.getTime() - 12 * HOUR), -1);

export const isCompletedMonth = (month: Month, now: Date = new Date()) => month <= latestCompletedMonth(now);

// The latest month that is "current" for anyone (UTC+14). Later months
// can't have cooks yet.
export const latestStartedMonth = (now: Date = new Date()) => monthAt(now.getTime() + 14 * HOUR);

// "September 2026" / "Sep 2026".
export function formatMonth(month: Month, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { timeZone: "UTC", month: style, year: "numeric" });
}

// "Best dinner, Sep 2026".
export const badgeLabel = (b: Badge) => `Best ${mealTypeLabel(b.mealType).toLowerCase()}, ${formatMonth(b.month, "short")}`;
