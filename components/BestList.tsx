import { ChefHat } from "lucide-react";
import Link from "next/link";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import type { BestOfMonth } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { cookPath, displayName } from "@/lib/links";
import { Avatar } from "./Avatar";

// One row per meal type on the Best tab: the winner (or leader) with its
// first photo, dish name, author and kudos count, or a quiet "No winner yet".
export function BestList({ best }: { best: BestOfMonth }) {
  return (
    <ul className="border-t border-border">
      {best.map(({ mealType, cook, score }) => (
        <li key={mealType} className="border-b border-border" data-testid="best-row">
          {cook ? (
            <Link href={cookPath(cook.author.did, cook.rkey)} className="flex gap-4 px-4 py-4 active:bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy */}
              <img
                src={imageUrl(cook.author.did, cook.images[0].cid, "thumb")}
                alt={cook.images[0].alt ?? ""}
                className="h-26 w-26 shrink-0 rounded-control bg-sunken object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-small font-semibold text-muted">{mealTypeLabel(mealType)}</p>
                <h2 className="mt-0.5 line-clamp-2 font-display text-dish break-words">{cook.dishName}</h2>
                <div className="mt-auto flex items-center gap-2 pt-2 text-small">
                  <Avatar author={cook.author} size={24} />
                  <span className="min-w-0 flex-1 truncate">{displayName(cook.author)}</span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-muted tabular-nums"
                    aria-label={`${score} kudos`}
                  >
                    <ChefHat size={18} strokeWidth={1.8} aria-hidden />
                    {score}
                  </span>
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
              <p className="text-small font-semibold text-muted">{mealTypeLabel(mealType)}</p>
              <p className="text-small text-muted">No winner yet</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
