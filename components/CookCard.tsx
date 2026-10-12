import Link from "next/link";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import type { CookView } from "@/lib/db/queries";
import { cookPath, displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";
import { BestBadge } from "./BestBadge";
import { CardActions } from "./CardActions";
import { PhotoCarousel } from "./PhotoCarousel";
import { TimeAgo } from "./TimeAgo";

// One cook in a feed (§7): author and meal, photos edge to edge, the dish in
// the display serif, the note (3 lines), then the kudos toggle and comment
// count (CardActions). Cards are separated by a sunken band, not hairlines.
export function CookCard({ cook, viewerDid }: { cook: CookView; viewerDid: string }) {
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
      <Link href={href} className="block px-4 pt-4 active:opacity-80">
        {cook.badge && <BestBadge badge={cook.badge} className="mb-1.5" />}
        <h2 className="font-display text-dish text-balance break-words">{cook.dishName}</h2>
        {cook.note && <p className="mt-2 line-clamp-3 text-body break-words whitespace-pre-line">{cook.note}</p>}
      </Link>
      <CardActions cook={cook} href={href} canGive={cook.author.did !== viewerDid} />
    </article>
  );
}
