import { ChefHat, MessageCircle } from "lucide-react";
import Link from "next/link";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import type { CookView } from "@/lib/db/queries";
import { cookPath, displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";
import { BestBadge } from "./BestBadge";
import { PhotoCarousel } from "./PhotoCarousel";
import { TimeAgo } from "./TimeAgo";

// One cook in a feed (§7): author and meal, photos edge to edge, the dish in
// the display serif, the note (3 lines), kudos and comment counts. Cards are
// separated by a sunken band rather than hairlines.
export function CookCard({ cook }: { cook: CookView }) {
  const href = cookPath(cook.author.did, cook.rkey);
  return (
    <article className="border-b-8 border-sunken bg-background" data-testid="cook-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={profilePath(cook.author)} className="shrink-0">
          <Avatar author={cook.author} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profilePath(cook.author)} className="block truncate text-body font-semibold">
            {displayName(cook.author)}
          </Link>
          <p className="text-small text-muted">
            {mealTypeLabel(cook.mealType)}
            <span aria-hidden>, </span>
            <TimeAgo iso={cook.sortAt} long />
          </p>
        </div>
      </header>
      <PhotoCarousel did={cook.author.did} images={cook.images} />
      <Link href={href} className="block px-4 pt-4 pb-3 active:opacity-80">
        {cook.badge && <BestBadge badge={cook.badge} className="mb-1.5" />}
        <h2 className="font-display text-dish text-balance break-words">{cook.dishName}</h2>
        {cook.note && <p className="mt-2 line-clamp-3 text-body break-words whitespace-pre-line">{cook.note}</p>}
        <CookCounts kudos={cook.kudosCount} comments={cook.commentCount} />
      </Link>
    </article>
  );
}

function CookCounts({ kudos, comments }: { kudos: number; comments: number }) {
  const label = `${kudos} kudos, ${comments} ${comments === 1 ? "comment" : "comments"}`;
  return (
    <p className="mt-3 flex items-center gap-5 text-small font-medium text-muted" aria-label={label}>
      <span className="inline-flex items-center gap-1.5" aria-hidden>
        <ChefHat size={20} strokeWidth={1.8} />
        {kudos > 0 && <span className="tabular-nums">{kudos}</span>}
      </span>
      <span className="inline-flex items-center gap-1.5" aria-hidden>
        <MessageCircle size={20} strokeWidth={1.8} />
        {comments > 0 && <span className="tabular-nums">{comments}</span>}
      </span>
    </p>
  );
}
