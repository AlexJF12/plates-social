"use client";

import Link from "next/link";
import { useEffect } from "react";

// Body of the error.tsx boundaries: a page failed to render on the server
// (e.g. the database is unreachable). retry() re-fetches the segment.
export function ErrorState({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">This page couldn&apos;t load. Check your connection and try again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 h-11 rounded-lg bg-accent px-5 font-semibold text-accent-foreground"
      >
        Try again
      </button>
      <Link href="/following" className="mt-2 flex h-11 items-center px-5 font-medium text-accent">
        Go to your feed
      </Link>
    </main>
  );
}
