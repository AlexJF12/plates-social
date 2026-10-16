import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AteOutLabel } from "@/components/AteOutLabel";
import { Avatar } from "@/components/Avatar";
import { CookComments } from "@/components/CookComments";
import { CookKudos } from "@/components/CookKudos";
import { DeletePostButton } from "@/components/DeletePostButton";
import { PageHeader } from "@/components/PageHeader";
import { AuthorLink, FullPhotos } from "@/components/PostParts";
import { SharePostButton } from "@/components/SharePostButton";
import { RestaurantArea } from "@/components/RestaurantArea";
import { Stars } from "@/components/Stars";
import { button } from "@/components/ui";
import { PUBLIC_URL } from "@/lib/auth/client";
import { getDid } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config";
import { formatVisitDate } from "@/lib/cook/datetime";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { type Author, type VisitView, getAccount, getVisitDetail } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { displayName, profilePath, visitPath } from "@/lib/links";
import { starsText, visitShareText } from "@/lib/share";

// One request's worth: generateMetadata and the page both need it.
const loadVisit = cache((did: string, rkey: string, viewer: string | null) =>
  getVisitDetail(decodeURIComponent(did), rkey, undefined, viewer),
);

const place = (v: VisitView) => [v.restaurantName, v.restaurantArea].filter(Boolean).join(", ");

// Link previews for shared visits, like the cook page: the restaurant and
// area, who ate there, the stars and review, and the first photo.
export async function generateMetadata({ params }: PageProps<"/visit/[did]/[rkey]">): Promise<Metadata> {
  const { did, rkey } = await params;
  const detail = await loadVisit(did, rkey, await getDid());
  if (!detail) return { title: APP_NAME, robots: { index: false } };
  const { visit } = detail;
  const title = `${place(visit)} · ${displayName(visit.author)}`;
  const description = `${starsText(visit.rating)}${visit.review ? ` ${visit.review.slice(0, 200)}` : ""}`;
  const img = visit.images[0];
  const images = img ? [{ url: imageUrl(visit.author.did, img.cid, "thumb"), alt: img.alt ?? "" }] : [];
  return {
    metadataBase: new URL(PUBLIC_URL),
    title,
    description,
    robots: { index: false },
    alternates: { canonical: visitPath(visit.author.did, visit.rkey) },
    openGraph: { type: "article", siteName: APP_NAME, title, description, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

// One visit (Phase 6.8): every photo at full aspect ratio, the restaurant,
// the stars, the date it was eaten (never a time), the review, kudos and
// comments. Public like the cook page.
export default async function VisitPage({ params }: PageProps<"/visit/[did]/[rkey]">) {
  const { did, rkey } = await params;
  const viewerDid = await getDid();
  const detail = await loadVisit(did, rkey, viewerDid);
  if (!detail) notFound();
  const { visit, kudos, comments } = detail;

  if (!viewerDid) return <PublicVisit visit={visit} kudosCount={kudos.length} />;

  const isMine = visit.author.did === viewerDid;
  const account = await getAccount(viewerDid);
  const viewer = account ?? { did: viewerDid, handle: null, displayName: null, avatarCid: null };
  const share = {
    kind: "visit" as const,
    uri: visit.uri,
    rkey: visit.rkey,
    authorDid: visit.author.did,
    text: visitShareText(visit),
    images: visit.images,
  };

  return (
    <>
      <PageHeader
        title=""
        back
        action={
          <div className={isMine ? "flex items-center" : "-mr-2 flex items-center"}>
            <SharePostButton post={share} canPostToBluesky={isMine} viewerDid={viewerDid} />
            {isMine && (
              <DeletePostButton
                kind="visit"
                rkey={visit.rkey}
                afterPath={profilePath(visit.author)}
                viewerDid={viewerDid}
                herePath={visitPath(visit.author.did, visit.rkey)}
              />
            )}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-md pb-8">
        <VisitBody visit={visit} linkAuthor />
        <CookKudos cookUri={visit.uri} viewer={viewer} initialGiven={visit.viewerKudos} initialKudos={kudos} canGive={!isMine} />
        <CookComments cookUri={visit.uri} viewerDid={viewerDid} initial={comments} initialCount={visit.commentCount} />
      </main>
    </>
  );
}

function PublicVisit({ visit, kudosCount }: { visit: VisitView; kudosCount: number }) {
  const signIn = `/?next=${encodeURIComponent(visitPath(visit.author.did, visit.rkey))}`;
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
        <VisitBody visit={visit} linkAuthor={false} />
        <section className="mx-4 rounded-sheet bg-sunken px-5 py-6 text-center">
          <p className="text-small text-muted" data-testid="public-counts">
            {kudosCount} kudos · {visit.commentCount} {visit.commentCount === 1 ? "comment" : "comments"}
          </p>
          <p className="mt-2 font-display text-dish text-balance">Log what you cook and where you eat, see what friends do.</p>
          <Link href={signIn} className={`mt-4 ${button({ full: true })}`}>
            Sign in to give kudos
          </Link>
          <p className="mt-3 text-small text-muted">Use your Bluesky handle.</p>
        </section>
      </main>
    </>
  );
}

// Author row, photos, restaurant, stars, date and review.
function VisitBody({ visit, linkAuthor }: { visit: VisitView; linkAuthor: boolean }) {
  const author: Author = visit.author;
  const link = linkAuthor ? author : null;
  return (
    <>
      <header className="flex items-center gap-3 px-4 pb-3">
        <AuthorLink author={link} className="shrink-0">
          <Avatar author={author} size={40} />
        </AuthorLink>
        <div className="min-w-0 flex-1">
          <AuthorLink author={link} className="block truncate text-body font-semibold">{displayName(author)}</AuthorLink>
          <p className="text-small text-muted">{mealTypeLabel(visit.mealType)}</p>
        </div>
        <AteOutLabel />
      </header>

      <FullPhotos did={author.did} images={visit.images} />

      <section className="px-4 pt-5 pb-6">
        <h2 className="font-display text-title text-balance break-words">{visit.restaurantName}</h2>
        {visit.restaurantArea && <RestaurantArea area={visit.restaurantArea} className="mt-0.5 text-body" />}
        <div className="mt-3">
          <Stars rating={visit.rating} size={22} />
        </div>
        <p className="mt-2 text-small text-muted" data-testid="visit-date">
          Visited <time dateTime={visit.visitedLocalDate}>{formatVisitDate(visit.visitedLocalDate)}</time>
        </p>
        {visit.review && <p className="mt-4 text-lead break-words whitespace-pre-line">{visit.review}</p>}
      </section>
    </>
  );
}
