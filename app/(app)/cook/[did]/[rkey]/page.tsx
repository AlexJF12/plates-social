import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CookComments } from "@/components/CookComments";
import { CookKudos } from "@/components/CookKudos";
import { DeleteCookButton } from "@/components/DeleteCookButton";
import { PageHeader } from "@/components/PageHeader";
import { TimeAgo } from "@/components/TimeAgo";
import { getDid } from "@/lib/auth/session";
import { formatCookedAt } from "@/lib/cook/datetime";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { getAccount, getCookDetail, getKudosUri } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { displayName, profilePath } from "@/lib/links";

// One cook: every photo at its full aspect ratio, the full note, kudos and
// comments (§2.1). The author can delete it; others can give kudos.
export default async function CookPage({ params }: PageProps<"/cook/[did]/[rkey]">) {
  const viewerDid = await getDid();
  if (!viewerDid) redirect("/");
  const { did, rkey } = await params;
  const detail = await getCookDetail(decodeURIComponent(did), rkey);
  if (!detail) notFound();
  const { cook, kudos, comments } = detail;
  const isMine = cook.author.did === viewerDid;
  const [kudosUri, account] = await Promise.all([getKudosUri(viewerDid, cook.uri), getAccount(viewerDid)]);
  const viewer = account ?? { did: viewerDid, handle: null, displayName: null, avatarCid: null };

  return (
    <>
      <PageHeader title={cook.dishName} back />
      <main className="mx-auto w-full max-w-md pb-8">
        <header className="flex h-14 items-center gap-3 px-4">
          <Link href={profilePath(cook.author)} className="flex min-w-0 items-center gap-3">
            <Avatar author={cook.author} size={32} />
            <span className="truncate text-sm font-semibold">{displayName(cook.author)}</span>
          </Link>
          <span className="ml-auto shrink-0 text-sm text-muted">
            <TimeAgo iso={cook.sortAt} />
          </span>
        </header>

        <div className="space-y-1">
          {cook.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
            <img
              key={img.cid + i}
              src={imageUrl(cook.author.did, img.cid, "full")}
              alt={img.alt ?? ""}
              width={img.aspectRatio.width}
              height={img.aspectRatio.height}
              loading={i === 0 ? "eager" : "lazy"}
              className="h-auto w-full bg-border"
              style={{ aspectRatio: `${img.aspectRatio.width} / ${img.aspectRatio.height}` }}
            />
          ))}
        </div>

        <section className="px-4 pt-4">
          <h2 className="text-2xl leading-tight font-bold break-words">{cook.dishName}</h2>
          <p className="mt-1 text-xs font-medium tracking-wide text-muted uppercase">
            {mealTypeLabel(cook.mealType)} · Cooked {formatCookedAt(cook.cookedAt)}
          </p>
          {cook.note && <p className="mt-3 text-[15px] break-words whitespace-pre-line">{cook.note}</p>}
        </section>

        {isMine && (
          <div className="px-4 pt-4">
            <DeleteCookButton rkey={cook.rkey} afterPath={profilePath(cook.author)} />
          </div>
        )}

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
