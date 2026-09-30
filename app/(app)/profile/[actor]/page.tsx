import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CookFeed } from "@/components/CookFeed";
import { FollowButton } from "@/components/FollowButton";
import { LogoutButton } from "@/components/LogoutButton";
import { PageHeader } from "@/components/PageHeader";
import { getDid } from "@/lib/auth/session";
import { getAccount, getCookFeed, getFollowUri } from "@/lib/db/queries";
import { displayName } from "@/lib/links";

// A person's cooks, newest first. [actor] is a handle or a DID. Others get a
// follow button; your own has the Bluesky import and sign-out. Stats
// arrive in Phase 6.
export default async function ProfilePage({ params }: PageProps<"/profile/[actor]">) {
  const viewer = await getDid();
  if (!viewer) redirect("/");
  const account = await getAccount(decodeURIComponent((await params).actor));
  if (!account) notFound();
  const isMe = account.did === viewer;
  const [initial, followUri] = await Promise.all([
    getCookFeed({ authorDid: account.did }),
    isMe ? null : getFollowUri(viewer, account.did),
  ]);

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
        <section className="flex flex-wrap items-start gap-2 px-4 pb-4">
          {isMe ? (
            <>
              <Link href="/import" className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">
                Find people from Bluesky
              </Link>
              <LogoutButton />
            </>
          ) : (
            <FollowButton subject={account.did} initialFollowing={Boolean(followUri)} />
          )}
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
