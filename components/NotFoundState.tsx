import Link from "next/link";

// A cook or profile that doesn't exist, was deleted, or is hidden.
export function NotFoundState() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-muted">It may have been deleted, or the link is wrong.</p>
      <Link href="/following" className="mt-5 flex h-11 items-center rounded-lg bg-accent px-5 font-semibold text-accent-foreground">
        Go to your feed
      </Link>
    </main>
  );
}
