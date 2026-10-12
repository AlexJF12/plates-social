"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "@/app/api/search/route";
import { MEAL_TYPES } from "@/lib/cook/mealTypes";
import { displayName, profilePath } from "@/lib/links";
import { SEARCH_MAX, normalizeMeal, normalizeQuery } from "@/lib/search";
import { Avatar } from "./Avatar";
import { CookFeed } from "./CookFeed";
import { EmptyState, ErrorText, button, chip, input } from "./ui";

const DEBOUNCE_MS = 250;

const searchKey = (q: string | null, meal: string | null) => `${q ?? ""}|${meal ?? ""}`;

// The search in the address bar. On Back, Next re-renders this page from
// its cached payload, whose props are the URL it was first loaded with (the
// query was added later with replaceState), so the address bar wins.
function fromAddressBar() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  return { text: p.get("q") ?? "", meal: normalizeMeal(p.get("meal")) };
}

// The search screen (Phase 6.6): a field and meal-type chips in a sticky
// header, then people (hidden while a meal is picked) and cooks. Typing
// updates the URL in place (replaceState: one history entry, no server
// round trip) and fetches /api/search after a pause; stale requests are
// aborted, so an older response never replaces a newer one.
export function SearchView({
  viewerDid,
  initialText,
  initialMeal,
  initial,
}: {
  viewerDid: string;
  initialText: string;
  initialMeal: string | null;
  initial: SearchResult | null;
}) {
  const [text, setText] = useState(() => fromAddressBar()?.text ?? initialText);
  const [meal, setMeal] = useState(() => fromAddressBar()?.meal ?? initialMeal);
  const initialKey = searchKey(normalizeQuery(initialText), initialMeal);
  // The results on screen and the search they belong to.
  const [shown, setShown] = useState(initial && { key: initialKey, result: initial });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const fetched = useRef(initialKey);
  const q = normalizeQuery(text);
  const key = searchKey(q, meal);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (text.trim()) qs.set("q", text.trim().slice(0, SEARCH_MAX));
    if (meal) qs.set("meal", meal);
    const url = `/search${qs.size ? `?${qs}` : ""}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);

    if (!q || (key === fetched.current && attempt === 0)) {
      fetched.current = key;
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${new URLSearchParams({ q, ...(meal ? { meal } : {}) })}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const result: SearchResult = await res.json();
        fetched.current = key;
        setShown({ key, result });
        setStatus("idle");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, q, meal, key, attempt]);

  const params = useMemo(() => ({ q: q ?? "", ...(meal ? { meal } : {}) }), [q, meal]);

  return (
    <>
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
        <h1 className="sr-only">Search</h1>
        <div className="mx-auto max-w-md">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="relative px-4 pt-2">
            <Search
              size={20}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-7 mt-1 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={SEARCH_MAX}
              placeholder="Dishes or people"
              aria-label="Search dishes and people"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!initialText}
              className={`${input} h-11 pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {text && (
              <button
                type="button"
                onClick={() => setText("")}
                aria-label="Clear search"
                className="absolute top-2 right-4 flex h-11 w-11 items-center justify-center text-muted active:opacity-60"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            )}
          </form>
          <div
            role="group"
            aria-label="Meal type"
            className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {[{ value: null, label: "All" }, ...MEAL_TYPES].map((m) => (
              <button
                key={m.label}
                type="button"
                aria-pressed={meal === m.value}
                onClick={() => setMeal(m.value)}
                className={chip(meal === m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md" aria-busy={status === "loading"}>
        {!q ? (
          <EmptyState title="Find a cook">
            Search dish names, like &ldquo;carbonara&rdquo;, or people by name or handle.
          </EmptyState>
        ) : status === "error" ? (
          <div className="px-4 py-8 text-center">
            <ErrorText>Search didn&apos;t load.</ErrorText>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${button({ variant: "quiet" })} mt-2`}>
              Try again
            </button>
          </div>
        ) : shown?.key !== key ? (
          <p className="px-4 py-8 text-center text-small text-muted">Searching…</p>
        ) : (
          <>
            {!meal && shown.result.people.length > 0 && <People people={shown.result.people} />}
            <CookFeed
              key={shown.key}
              initial={shown.result}
              viewerDid={viewerDid}
              refreshable={false}
              api="/api/search"
              params={params}
              empty={
                <EmptyState
                  title={meal ? "No cooks match with this meal" : "No cooks match"}
                  actions={
                    meal && (
                      <button type="button" onClick={() => setMeal(null)} className={button({ variant: "secondary" })}>
                        Search all meals
                      </button>
                    )
                  }
                >
                  Try a shorter word or part of the dish name.
                </EmptyState>
              }
            />
          </>
        )}
      </main>
    </>
  );
}

function People({ people }: { people: SearchResult["people"] }) {
  return (
    <section aria-labelledby="people-heading" className="border-b-8 border-sunken pb-2">
      <h2 id="people-heading" className="px-4 pt-3 pb-1 text-small font-semibold text-muted">
        People
      </h2>
      <ul>
        {people.map((p) => (
          <li key={p.did}>
            <Link href={profilePath(p)} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-sunken">
              <Avatar author={p} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{displayName(p)}</span>
                {p.handle && <span className="block truncate text-small text-muted">@{p.handle}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
