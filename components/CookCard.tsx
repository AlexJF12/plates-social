import Link from "next/link";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import type { CookView } from "@/lib/db/queries";
import { cookPath, displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";
import { PhotoCarousel } from "./PhotoCarousel";
import { TimeAgo } from "./TimeAgo";

// One cook in a feed (§7): author row, photos, dish, meal type, note
// (3 lines), counts.
export function CookCard({ cook }: { cook: CookView }) {
  const href = cookPath(cook.author.did, cook.rkey);
  return (
    <article className="border-b border-border pb-4" data-testid="cook-card">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link href={profilePath(cook.author)} className="flex min-w-0 items-center gap-3">
          <Avatar author={cook.author} size={32} />
          <span className="truncate text-sm font-semibold">{displayName(cook.author)}</span>
        </Link>
        <span className="ml-auto shrink-0 text-sm text-muted">
          <TimeAgo iso={cook.sortAt} />
        </span>
      </header>
      <PhotoCarousel did={cook.author.did} images={cook.images} />
      <Link href={href} className="block px-4 pt-3">
        <h2 className="text-lg leading-snug font-semibold break-words">{cook.dishName}</h2>
        <p className="mt-0.5 text-xs font-medium tracking-wide text-muted uppercase">
          {mealTypeLabel(cook.mealType)}
        </p>
        {cook.note && <p className="mt-2 line-clamp-3 text-[15px] break-words whitespace-pre-line">{cook.note}</p>}
        <p className="mt-2 text-sm text-muted">
          {cook.kudosCount} kudos · {cook.commentCount} {cook.commentCount === 1 ? "comment" : "comments"}
        </p>
      </Link>
    </article>
  );
}
