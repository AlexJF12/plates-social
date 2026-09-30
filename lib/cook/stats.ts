// Profile stats (§6.4): cooks this week and this month. A cook's day is
// cookedLocalDate, the date in the author's own offset (see localDateOf).
// "This week/month" is decided by the viewer's calendar: the server sends
// per-day counts for a window wide enough for any time zone, and the
// browser picks its own today. Dates are 'YYYY-MM-DD' strings throughout.

export type DayCount = { date: string; count: number };

const MS_PER_DAY = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => fromUtc(toUtc(date) + n * MS_PER_DAY);

// Weeks start on Monday.
export function weekStart(date: string): string {
  const daysSinceMonday = (new Date(toUtc(date)).getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

function monthEnd(date: string): string {
  const d = new Date(toUtc(date));
  return fromUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

// Today's date in an IANA time zone.
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Days the server must count so that any viewer's week and month are
// covered. Time zones run from UTC-12 to UTC+14, so a viewer's today is
// the UTC date or one day either side.
export function statsWindow(now: Date = new Date()): { from: string; to: string } {
  const utcToday = now.toISOString().slice(0, 10);
  const earliest = addDays(utcToday, -1);
  const latest = addDays(utcToday, 1);
  const min = (a: string, b: string) => (a < b ? a : b);
  const max = (a: string, b: string) => (a > b ? a : b);
  return {
    from: min(weekStart(earliest), monthStart(earliest)),
    to: max(addDays(weekStart(latest), 6), monthEnd(latest)),
  };
}

// Counts for the week (Monday to Sunday) and calendar month containing today.
export function countStats(days: DayCount[], today: string): { week: number; month: number } {
  const wFrom = weekStart(today);
  const wTo = addDays(wFrom, 6);
  const month = today.slice(0, 7);
  let w = 0;
  let m = 0;
  for (const { date, count } of days) {
    if (date >= wFrom && date <= wTo) w += count;
    if (date.slice(0, 7) === month) m += count;
  }
  return { week: w, month: m };
}
