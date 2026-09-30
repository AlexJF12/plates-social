import Link from "next/link";
import { redirect } from "next/navigation";
import { CookFeed } from "@/components/CookFeed";
import { FeedHeader } from "@/components/FeedHeader";
import { EmptyState, button } from "@/components/ui";
import { getDid } from "@/lib/auth/session";
import { getCookFeed } from "@/lib/db/queries";

// Manifest start_url. Cooks from people you follow in this app, plus your
// own (§2.1), newest first.
export default async function FollowingPage() {
  const did = await getDid();
  if (!did) redirect("/");
  const initial = await getCookFeed({ followedBy: did });

  return (
    <>
      <FeedHeader current="/following" />
      <main className="mx-auto w-full max-w-md">
        <CookFeed
          initial={initial}
          following
          empty={
            <EmptyState
              title="Follow people to fill this feed"
              actions={
                <>
                  <Link href="/import" className={button()}>
                    Find people from Bluesky
                  </Link>
                  <Link href="/global" className={button({ variant: "quiet" })}>
                    Browse the global feed
                  </Link>
                </>
              }
            >
              Cooks from people you follow show up here, along with your own.
            </EmptyState>
          }
        />
      </main>
    </>
  );
}
