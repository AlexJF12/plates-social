import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { TimeAgo } from "@/components/TimeAgo";
import { getDid } from "@/lib/auth/session";
import { formatCookedAt } from "@/lib/cook/datetime";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { getCookDetail } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { displayName, profilePath } from "@/lib/links";

// One cook: every photo at its full aspect ratio, the full note, kudos and
// comments (§2.1). Giving kudos and commenting arrive in Phase 5.
export default async function CookPage({ params }: PageProps<"/cook/[did]/[rkey]">) {
  if (!(await getDid())) redirect("/");
  const { did, rkey } = await params;
  const detail = await getCookDetail(decodeURIComponent(did), rkey);
  if (!detail) notFound();
  const { cook, kudos, comments } = detail;

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

        <section className="mt-6 border-t border-border px-4 pt-4" aria-labelledby="kudos-h">
          <h3 id="kudos-h" className="text-sm font-semibold">
            {kudos.length} kudos
          </h3>
          {kudos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {kudos.map((k) => (
                <li key={k.did}>
                  <Link href={profilePath(k)} title={displayName(k)} aria-label={displayName(k)}>
                    <Avatar author={k} size={28} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 border-t border-border px-4 pt-4" aria-labelledby="comments-h">
          <h3 id="comments-h" className="text-sm font-semibold">
            {cook.commentCount} {cook.commentCount === 1 ? "comment" : "comments"}
          </h3>
          {comments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No comments yet.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {comments.map((c) => (
                <li key={c.uri} className="flex gap-3">
                  <Link href={profilePath(c.author)} className="shrink-0">
                    <Avatar author={c.author} size={32} />
                  </Link>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Link href={profilePath(c.author)} className="font-semibold">
                        {displayName(c.author)}
                      </Link>{" "}
                      <span className="text-muted">
                        <TimeAgo iso={c.sortAt} />
                      </span>
                    </p>
                    <p className="text-[15px] break-words whitespace-pre-line">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
