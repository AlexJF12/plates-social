"use client";

import { Star } from "lucide-react";
import { useRef } from "react";

// The rating input on the Log form (Phase 6.8): a radiogroup of five 44px
// star buttons, "1 star" … "5 stars". Arrow keys move and select, as in a
// native radio group (one tab stop). An input, so basil like every control;
// terracotta is only for showing a rating.
export function StarRating({ value, onChange, disabled }: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // The tab stop: the chosen star, or the first when none is chosen.
  const focusable = value || 1;

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(5, i + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(1, i - 1)
      : e.key === "Home" ? 1
      : e.key === "End" ? 5
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Rating" className="-ml-2.5 flex" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          ref={(el) => {
            refs.current[i - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={i === 1 ? "1 star" : `${i} stars`}
          tabIndex={i === focusable ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(i)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-100 motion-safe:active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-45 ${
            i <= value ? "text-accent" : "text-muted"
          }`}
        >
          <Star size={30} strokeWidth={1.7} fill={i <= value ? "currentColor" : "none"} aria-hidden />
        </button>
      ))}
    </div>
  );
}
