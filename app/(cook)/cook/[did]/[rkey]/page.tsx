import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Avatar } from "@/components/Avatar";
import { BestBadge } from "@/components/BestBadge";
import { CookComments } from "@/components/CookComments";
import { CookKudos } from "@/components/CookKudos";
import { DeleteCookButton } from "@/components/DeleteCookButton";
import { PageHeader } from "@/components/PageHeader";
import { ShareCookButton } from "@/components/ShareCookButton";
import { TimeAgo } from "@/components/TimeAgo";
import { button } from "@/components/ui";
import { PUBLIC_URL } from "@/lib/auth/client";
import { getDid } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config";
import { formatCookedAt } from "@/lib/cook/datetime";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { type Author, getAccount, getCookDetail, getKudosUri } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { cookPath, displayName, profilePath } from "@/lib/links";

// One request's worth: generateMetadata and the page both need it.
const loadCook = cache((did: string, rkey: string) => getCookDetail(decodeURIComponent(did), rkey));

// Link previews (Messages, Bluesky, …) for shared cooks: the dish, who
// cooked it, the note and the first photo. Not for search engines.
export async function generateMetadata({ params }: PageProps<"/cook/[did]/[rkey]">): Promise<Metadata> {
  const { did, rkey } = await params;
  const detail = await loadCook(did, rkey);
  if (!detail) return { title: APP_NAME, robots: { index: false } };
  const { cook } = detail;
  const title = `${cook.dishName} · ${displayName(cook.author)}`;
  const description = cook.note ? cook.note.slice(0, 200) : `Cooked by ${displayName(cook.author)} on ${APP_NAME}.`;
  const img = cook.images[0];
  const images = img
    ? // No width/height: aspectRatio is only a ratio, and the thumb is resized.
      [{ url: imageUrl(cook.author.did, img.cid, "thumb"), alt: img.alt ?? "" }]
    : [];
  return {
    metadataBase: new URL(PUBLIC_URL),
    title,
    description,
    robots: { index: false },
    alternates: { canonical: cookPath(cook.author.did, cook.rkey) },
    openGraph: { type: "article", siteName: APP_NAME, title, description, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

// One cook: every photo at its full aspect ratio, the full note, kudos and
// comments (§2.1). The author can delete it; others can give kudos. Anyone
// can share it. Public: signed-out visitors (from a shared link) see the
// cook read-only, with a way to sign in and come back here.
export default async function CookPage({ params }: PageProps<"/cook/[did]/[rkey]">) {
  const { did, rkey } = await params;
  const [viewerDid, detail] = await Promise.all([getDid(), loadCook(did, rkey)]);
  if (!detail) notFound();
  const { cook, kudos, comments } = detail;

  if (!viewerDid) return <PublicCook cook={cook} kudosCount={kudos.length} />;

  const isMine = cook.author.did === viewerDid;
  const [kudosUri, account] = await Promise.all([getKudosUri(viewerDid, cook.uri), getAccount(viewerDid)]);
  const viewer = account ?? { did: viewerDid, handle: null, displayName: null, avatarCid: null };
  const share = {
    uri: cook.uri,
    rkey: cook.rkey,
    authorDid: cook.author.did,
    dishName: cook.dishName,
    note: cook.note,
    images: cook.images,
  };

  return (
    <>
      <PageHeader
        title=""
        back
        action={
          // DeleteCookButton pulls itself to the edge; otherwise Share does.
          <div className={isMine ? "flex items-center" : "-mr-2 flex items-center"}>
            <ShareCookButton cook={share} canPostToBluesky={isMine} viewerDid={viewerDid} />
            {isMine && <DeleteCookButton rkey={cook.rkey} afterPath={profilePath(cook.author)} />}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-md pb-8">
        <CookBody cook={cook} linkAuthor />
        <CookKudos
          cookUri={cook.uri}
          viewer={viewer}
          initialGiven={Boolean(kudosUri)}
          initialKudos={kudos}
          canGive={!isMine}
        />
        <CookComments cookUri={cook.uri} viewerDid={viewerDid} initial={comments} initialCount={cook.commentCount} />
      </main>
    </>
  );
}

type Cook = NonNullable<Awaited<ReturnType<typeof getCookDetail>>>["cook"];

function PublicCook({ cook, kudosCount }: { cook: Cook; kudosCount: number }) {
  const signIn = `/?next=${encodeURIComponent(cookPath(cook.author.did, cook.rkey))}`;
  return (
    <>
      <PageHeader
        title={APP_NAME}
        action={
          <Link href={signIn} className={button({ variant: "quiet" })}>
            Sign in
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-md pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <CookBody cook={cook} linkAuthor={false} />
        <section className="mx-4 rounded-sheet bg-sunken px-5 py-6 text-center">
          <p className="text-small text-muted" data-testid="public-counts">
            {kudosCount} kudos · {cook.commentCount}{" "}
            {cook.commentCount === 1 ? "comment" : "comments"}
          </p>
          <p className="mt-2 font-display text-dish text-balance">Cook something, log it, see what friends cook.</p>
          <Link href={signIn} className={`mt-4 ${button({ full: true })}`}>
            Sign in to give kudos
          </Link>
          <p className="mt-3 text-small text-muted">Use your Bluesky handle.</p>
        </section>
      </main>
    </>
  );
}

// Author row, photos, dish, date and note. Signed out, the author isn't a
// link: profiles need sign-in.
function CookBody({ cook, linkAuthor }: { cook: Cook; linkAuthor: boolean }) {
  const author: Author = cook.author;
  const link = linkAuthor ? author : null;
  return (
    <>
      <header className="flex items-center gap-3 px-4 pb-3">
        <AuthorLink author={link} className="shrink-0">
          <Avatar author={author} size={40} />
        </AuthorLink>
        <div className="min-w-0 flex-1">
          <AuthorLink author={link} className="block truncate text-body font-semibold">{displayName(author)}</AuthorLink>
          <p className="text-small text-muted">
            {mealTypeLabel(cook.mealType)}
            <span aria-hidden>, </span>
            <TimeAgo iso={cook.sortAt} long />
          </p>
        </div>
      </header>

      <div className="space-y-1">
        {cook.images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
          <img
            key={img.cid + i}
            src={imageUrl(author.did, img.cid, "full")}
            alt={img.alt ?? ""}
            width={img.aspectRatio.width}
            height={img.aspectRatio.height}
            loading={i === 0 ? "eager" : "lazy"}
            className="h-auto w-full bg-sunken"
            style={{ aspectRatio: `${img.aspectRatio.width} / ${img.aspectRatio.height}` }}
          />
        ))}
      </div>

      <section className="px-4 pt-5 pb-6">
        {cook.badge && <BestBadge badge={cook.badge} className="mb-2" />}
        <h2 className="font-display text-title text-balance break-words">{cook.dishName}</h2>
        <p className="mt-2 text-small text-muted">Cooked {formatCookedAt(cook.cookedAt)}</p>
        {cook.note && <p className="mt-4 text-lead break-words whitespace-pre-line">{cook.note}</p>}
      </section>
    </>
  );
}

function AuthorLink({ author, className, children }: {
  author: Author | null;
  className: string;
  children: React.ReactNode;
}) {
  if (!author) return <span className={className}>{children}</span>;
  return (
    <Link href={profilePath(author)} className={className}>
      {children}
    </Link>
  );
}
