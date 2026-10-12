import { Trophy, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CookFeed } from "@/components/CookFeed";
import { FollowButton } from "@/components/FollowButton";
import { LogoutButton } from "@/components/LogoutButton";
import { PageHeader } from "@/components/PageHeader";
import { ProfileStats } from "@/components/ProfileStats";
import { EmptyState, button, chip } from "@/components/ui";
import { getDid } from "@/lib/auth/session";
import { formatMonth } from "@/lib/cook/best";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { statsWindow } from "@/lib/cook/stats";
import { getAccount, getAuthorBadges, getCookDayCounts, getCookFeed, getFollowUri } from "@/lib/db/queries";
import { cookPath, displayName } from "@/lib/links";

// A person's stats and cooks, newest first. [actor] is a handle or a DID.
// Others get a follow button; your own has the Bluesky import and sign-out.
export default async function ProfilePage({ params }: PageProps<"/profile/[actor]">) {
  const viewer = await getDid();
  if (!viewer) redirect("/");
  const account = await getAccount(decodeURIComponent((await params).actor));
  if (!account) notFound();
  const isMe = account.did === viewer;
  const [initial, days, followUri, wins] = await Promise.all([
    getCookFeed({ authorDid: account.did, viewer }),
    getCookDayCounts(account.did, statsWindow()),
    isMe ? null : getFollowUri(viewer, account.did),
    getAuthorBadges(account.did),
  ]);

  return (
    <>
      <PageHeader title={isMe ? "Profile" : ""} back={!isMe} />
      <main className="mx-auto w-full max-w-md">
        <section className="flex items-center gap-4 px-4 pt-2 pb-6">
          <Avatar author={account} size={80} />
          <div className="min-w-0">
            <p className="font-display text-title break-words" data-testid="profile-name">
              {displayName(account)}
            </p>
            <p className="mt-1 truncate text-small text-muted">{account.handle ? `@${account.handle}` : account.did}</p>
          </div>
        </section>
        <ProfileStats days={days} />
        {wins.length > 0 && (
          <section aria-labelledby="best-cooks" className="px-4 pb-5" data-testid="best-cooks">
            <h2 id="best-cooks" className="mb-2 text-small font-semibold text-muted">
              Best cooks
            </h2>
            <ul className="flex flex-wrap gap-2">
              {wins.map((w) => (
                <li key={`${w.month}-${w.mealType}`}>
                  <Link href={cookPath(account.did, w.uri.slice(w.uri.lastIndexOf("/") + 1))} className={chip(false)}>
                    <Trophy size={16} strokeWidth={2} className="mr-1.5" aria-hidden />
                    {mealTypeLabel(w.mealType)}, {formatMonth(w.month, "short")}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-1 px-4 pb-5">
          {isMe ? (
            <>
              <Link href="/import" className={button({ variant: "secondary", full: true })}>
                <Users size={18} strokeWidth={2} aria-hidden />
                Find people from Bluesky
              </Link>
              <LogoutButton />
            </>
          ) : (
            <FollowButton subject={account.did} initialFollowing={Boolean(followUri)} />
          )}
        </section>
        <div className="border-t-8 border-sunken">
          <CookFeed
            initial={initial}
            viewerDid={viewer}
            author={account.did}
            empty={
              isMe ? (
                <EmptyState
                  title="No cooks yet"
                  actions={
                    <Link href="/log" className={button()}>
                      Log your first cook
                    </Link>
                  }
                >
                  Your cooks and your weekly count will show up here.
                </EmptyState>
              ) : (
                <EmptyState title="No cooks yet">Nothing logged here so far.</EmptyState>
              )
            }
          />
        </div>
      </main>
    </>
  );
}
