import Link from "next/link";
import { EmptyState, button } from "./ui";

// A cook or profile that doesn't exist, was deleted, or is hidden.
export function NotFoundState() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
      <EmptyState
        title="Not found"
        actions={
          <Link href="/following" className={button()}>
            Go to your feed
          </Link>
        }
      >
        It may have been deleted, or the link is wrong.
      </EmptyState>
    </main>
  );
}
