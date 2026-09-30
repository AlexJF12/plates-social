"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// The installed app has no browser back button (§7.1). Go back if there's
// history inside the app, else to the global feed (e.g. opened from a link).
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/global"))}
      className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-sunken"
      aria-label="Back"
    >
      <ChevronLeft size={26} strokeWidth={2} aria-hidden />
    </button>
  );
}
