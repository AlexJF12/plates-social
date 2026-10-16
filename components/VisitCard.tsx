import Link from "next/link";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import type { VisitView } from "@/lib/db/queries";
import { displayName, profilePath, visitPath } from "@/lib/links";
import { AteOutLabel } from "./AteOutLabel";
import { Avatar } from "./Avatar";
import { CardActions } from "./CardActions";
import { PhotoCarousel } from "./PhotoCarousel";
import { RestaurantArea } from "./RestaurantArea";
import { RatingBadge, Stars } from "./Stars";
import { VisitDate } from "./VisitDate";

// One visit in a feed (Phase 6.8), next to cook cards: the same author row
// but with the visit's date (never a time), the "Ate out" label, photos as
// on a cook card with the rating over them, the restaurant in the display
// serif with its area (pinned), the stars, the review (3 lines), then the
// same kudos and comment counts.
export function VisitCard({ visit, viewerDid }: { visit: VisitView; viewerDid: string }) {
  const href = visitPath(visit.author.did, visit.rkey);
  return (
    <article className="border-b-8 border-sunken bg-background" data-testid="visit-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={profilePath(visit.author)} className="shrink-0">
          <Avatar author={visit.author} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profilePath(visit.author)} className="block truncate text-body font-semibold">
            {displayName(visit.author)}
          </Link>
          <p className="text-small text-muted">
            {mealTypeLabel(visit.mealType)}
            <span aria-hidden>, </span>
            <VisitDate date={visit.visitedLocalDate} />
          </p>
        </div>
        <AteOutLabel />
      </header>
      <PhotoCarousel did={visit.author.did} images={visit.images} badge={<RatingBadge rating={visit.rating} />} />
      <Link href={href} className="block px-4 pt-4 active:opacity-80">
        <h2 className="font-display text-dish text-balance break-words">{visit.restaurantName}</h2>
        {visit.restaurantArea && <RestaurantArea area={visit.restaurantArea} className="text-small" />}
        <div className="mt-2">
          <Stars rating={visit.rating} />
        </div>
        {visit.review && <p className="mt-2 line-clamp-3 text-body break-words whitespace-pre-line">{visit.review}</p>}
      </Link>
      <CardActions cook={visit} href={href} canGive={visit.author.did !== viewerDid} />
    </article>
  );
}
