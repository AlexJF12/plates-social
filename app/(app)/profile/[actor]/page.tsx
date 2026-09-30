import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CookFeed } from "@/components/CookFeed";
import { PageHeader } from "@/components/PageHeader";
import { getDid } from "@/lib/auth/session";
import { getAccount, getCookFeed } from "@/lib/db/queries";
import { displayName } from "@/lib/links";

// A person's cooks, newest first. [actor] is a handle or a DID. Follow
// button (Phase 4) and stats (Phase 6) come later.
export default async function ProfilePage({ params }: PageProps<"/profile/[actor]">) {
  const viewer = await getDid();
  if (!viewer) redirect("/");
  const account = await getAccount(decodeURIComponent((await params).actor));
  if (!account) notFound();
  const isMe = account.did === viewer;
  const initial = await getCookFeed({ authorDid: account.did });

  return (
    <>
      <PageHeader title={displayName(account)} back={!isMe} />
      <main className="mx-auto w-full max-w-md">
        <section className="flex items-center gap-4 px-4 py-5">
          <Avatar author={account} size={72} />
          <div className="min-w-0">
            <p className="truncate text-xl font-bold" data-testid="profile-name">
              {displayName(account)}
            </p>
            <p className="truncate text-sm text-muted">{account.handle ? `@${account.handle}` : account.did}</p>
          </div>
        </section>
        <CookFeed
          initial={initial}
          author={account.did}
          empty={
            <div className="px-6 py-16 text-center">
              <p className="font-semibold">No cooks yet</p>
              {isMe ? (
                <Link href="/log" className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-semibold text-accent-foreground">
                  Log your first cook
                </Link>
              ) : (
                <p className="mt-1 text-sm text-muted">Nothing logged here yet.</p>
              )}
            </div>
          }
        />
      </main>
    </>
  );
}
