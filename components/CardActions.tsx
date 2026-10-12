"use client";

import { ChefHat, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { CookView } from "@/lib/db/queries";
import { useKudosToggle } from "./useKudosToggle";
import { ErrorText } from "./ui";

const iconTarget =
  "inline-flex h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-small font-medium " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The counts under a feed card (Phase 6.7): the kudos toggle (a plain count
// on your own cook) and the comment count, which opens the cook. Outside
// the card's link, so no control sits inside another.
export function CardActions({ cook, href, canGive }: { cook: CookView; href: string; canGive: boolean }) {
  const { given, delta, pending, error, toggle } = useKudosToggle(cook.uri, cook.viewerKudos);
  const kudos = cook.kudosCount + delta;
  const comments = cook.commentCount;
  const hat = (
    <>
      <ChefHat size={20} strokeWidth={given ? 2.2 : 1.8} fill={given ? "currentColor" : "none"} fillOpacity={0.25} aria-hidden />
      {kudos > 0 && <span className="tabular-nums">{kudos}</span>}
    </>
  );

  return (
    <div className="px-1 pb-1">
      <div className="flex items-center">
        {canGive ? (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={given}
            aria-label={given ? `Remove your kudos, ${kudos} so far` : `Give kudos, ${kudos} so far`}
            className={`${iconTarget} transition-[transform,opacity] duration-100 motion-safe:active:scale-90 disabled:opacity-45 ${
              given ? "text-accent" : "text-muted"
            }`}
            data-testid="card-kudos"
          >
            {hat}
          </button>
        ) : (
          <span className={`${iconTarget} text-muted`} aria-label={`${kudos} kudos`} role="img">
            {hat}
          </span>
        )}
        <Link
          href={href}
          className={`${iconTarget} text-muted active:opacity-60`}
          aria-label={`${comments} ${comments === 1 ? "comment" : "comments"}`}
        >
          <MessageCircle size={20} strokeWidth={1.8} aria-hidden />
          {comments > 0 && <span className="tabular-nums">{comments}</span>}
        </Link>
      </div>
      {error && <ErrorText className="px-3 pb-2">{error}</ErrorText>}
    </div>
  );
}
