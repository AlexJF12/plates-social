"use client";

import Link from "next/link";
import { useEffect } from "react";
import { EmptyState, button } from "./ui";

// Body of the error.tsx boundaries: a page failed to render on the server
// (e.g. the database is unreachable). retry() re-fetches the segment.
export function ErrorState({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
      <EmptyState
        title="This page didn't load"
        actions={
          <>
            <button type="button" onClick={() => retry()} className={button()}>
              Try again
            </button>
            <Link href="/following" className={button({ variant: "quiet" })}>
              Go to your feed
            </Link>
          </>
        }
      >
        Check your connection and try again.
      </EmptyState>
    </main>
  );
}
