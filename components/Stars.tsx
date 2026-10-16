import { Star } from "lucide-react";

// A visit's rating (Phase 6.8): five stars, filled to the rating in the
// eating-out colour. One image for screen readers ("4 out of 5 stars").
export function Stars({ rating, size = 18 }: { rating: number; size?: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="inline-flex items-center gap-0.5 text-out" data-testid="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.8}
          fill={i <= rating ? "currentColor" : "none"}
          className={i <= rating ? "" : "opacity-45"}
          aria-hidden
        />
      ))}
    </span>
  );
}

// The rating as a small pill over a visit card's photo, so a visit stands out
// while scrolling. Decorative: the stars under the name carry the label.
export function RatingBadge({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-out-soft px-2.5 py-1 text-small font-semibold text-out shadow-sm"
      aria-hidden
      data-testid="rating-badge"
    >
      <Star size={14} strokeWidth={1.8} fill="currentColor" />
      {rating}
    </span>
  );
}
