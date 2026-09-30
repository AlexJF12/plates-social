import Link from "next/link";
import { redirect } from "next/navigation";
import { CookFeed } from "@/components/CookFeed";
import { FeedHeader } from "@/components/FeedHeader";
import { EmptyState, button } from "@/components/ui";
import { getDid } from "@/lib/auth/session";
import { getCookFeed } from "@/lib/db/queries";

// Every cook indexed from the network, newest first (§2.1).
export default async function GlobalPage() {
  const viewer = await getDid();
  if (!viewer) redirect("/");
  const initial = await getCookFeed({ viewer });

  return (
    <>
      <FeedHeader current="/global" />
      <main className="mx-auto w-full max-w-md">
        <CookFeed
          initial={initial}
          viewerDid={viewer}
          empty={
            <EmptyState
              title="No cooks yet"
              actions={
                <Link href="/log" className={button()}>
                  Log a cook
                </Link>
              }
            >
              Be the first to log what you made.
            </EmptyState>
          }
        />
      </main>
    </>
  );
}
