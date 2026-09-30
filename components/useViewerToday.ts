"use client";

import { useSyncExternalStore } from "react";
import { todayIn } from "@/lib/cook/stats";

// Today's 'YYYY-MM-DD' in the viewer's own time zone, or null while
// rendering on the server (which doesn't know the zone). An installed app can
// sit in the background across midnight, so it's re-read whenever the app
// comes back to the foreground.
function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getToday = () => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
const getServerToday = () => null;

export const useViewerToday = () => useSyncExternalStore(subscribe, getToday, getServerToday);
