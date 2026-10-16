"use client";

import { useEffect, useState } from "react";
import { formatVisitDate, localToday } from "@/lib/cook/datetime";

// A visit's date on a card: "Today", "Yesterday" or "Wed 14 Oct", never a
// time (Phase 6.8). "Today" depends on the viewer's calendar, which only the
// browser knows: the server renders the plain date and the client swaps in
// Today/Yesterday after hydration.
export function VisitDate({ date }: { date: string }) {
  const [today, setToday] = useState<string | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the viewer's calendar is only known after hydration
    setToday(localToday());
  }, []);
  return <time dateTime={date}>{formatVisitDate(date, today)}</time>;
}
