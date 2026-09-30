// cookedAt is written in the author's local time *with* its UTC offset
// (§4), e.g. 2026-09-29T19:30:00-04:00. Stats (§6.4) bucket by the local
// date in that offset, so the offset must survive into the record.

const pad = (n: number) => String(n).padStart(2, "0");

// Local wall time of `date` in the runtime's time zone, with that zone's
// offset at that instant (so DST is handled per date, not per "now").
export function toLocalDatetimeWithOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// Value for <input type="datetime-local"> (no seconds, no offset).
export function toDatetimeLocalInput(date: Date): string {
  return toLocalDatetimeWithOffset(date).slice(0, 16);
}

// A datetime-local input value ("2026-09-29T19:30") is local wall time;
// `new Date` parses a string without an offset as local time.
export function datetimeLocalInputToCookedAt(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toLocalDatetimeWithOffset(date);
}

// The calendar date in the offset written in the datetime itself. RFC 3339
// puts the date part in that offset, so it's the first 10 characters
// (a "Z" datetime gives the UTC date, which is correct for that offset).
export function localDateOf(cookedAt: string): string {
  return cookedAt.slice(0, 10);
}

// "Mon, Sep 28, 12:34 PM": the wall-clock time the author recorded, in the
// author's own offset (not converted to the viewer's zone).
export function formatCookedAt(cookedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(cookedAt);
  if (!m) return cookedAt;
  const [, y, mo, d, h, mi] = m.map(Number);
  // Treat the local parts as UTC and format in UTC, so no zone shifts them.
  return new Date(Date.UTC(y, mo - 1, d, h, mi)).toLocaleString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
