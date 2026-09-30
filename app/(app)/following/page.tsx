import Link from "next/link";
import { redirect } from "next/navigation";
import { CookFeed } from "@/components/CookFeed";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader title="Following" />
      <main className="mx-auto w-full max-w-md">
        <CookFeed
          initial={initial}
          following
          empty={
            <div className="px-6 py-16 text-center">
              <p className="font-semibold">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted">
                Cooks from people you follow show up here, along with your own.
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                <Link href="/import" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 font-semibold text-accent-foreground">
                  Find people from Bluesky
                </Link>
                <Link href="/global" className="inline-flex h-11 items-center px-5 font-medium text-accent">
                  Browse the global feed
                </Link>
              </div>
            </div>
          }
        />
      </main>
    </>
  );
}
