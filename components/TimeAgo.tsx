"use client";

import { useEffect, useState } from "react";

function format(iso: string, now: number, long: boolean): string {
  const then = Date.parse(iso);
  const s = Math.max(0, (now - then) / 1000);
  const ago = long ? " ago" : "";
  if (s < 60) return long ? "just now" : "now";
  if (s < 3600) return `${Math.floor(s / 60)}m${ago}`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${ago}`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d${ago}`;
  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Relative time in the viewer's clock and time zone. The server can't know
// either, so the first render shows nothing and the client fills it in.
// `long` reads as a phrase ("2h ago") for use inside a sentence.
export function TimeAgo({ iso, long = false }: { iso: string; long?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the viewer's clock is only known after hydration
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} title={new Date(iso).toISOString()}>
      {now === null ? "" : format(iso, now, long)}
    </time>
  );
}
