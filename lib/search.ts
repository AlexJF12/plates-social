import { MEAL_TYPES } from "./cook/mealTypes";

// Search input rules (Phase 6.6), shared by the page and /api/search.
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

// Trimmed, inner whitespace collapsed, capped at SEARCH_MAX; null if too
// short to search.
export function normalizeQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, SEARCH_MAX).trim();
  return q.length >= SEARCH_MIN ? q : null;
}

// A known meal type, or null for "All" (anything else is ignored).
export const normalizeMeal = (raw: string | null | undefined): string | null =>
  MEAL_TYPES.some((m) => m.value === raw) ? raw! : null;
