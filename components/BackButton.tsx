"use client";

import { useRouter } from "next/navigation";

// The installed app has no browser back button (§7.1). Go back if there's
// history inside the app, else to the global feed (e.g. opened from a link).
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/global"))}
      className="-ml-2 flex h-11 w-11 items-center justify-center"
      aria-label="Back"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
