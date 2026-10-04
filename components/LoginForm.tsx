"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ErrorText, FieldLabel, button, input } from "./ui";

// Handle typeahead (Phase 6.6): Bluesky's public AppView, called from the
// browser so each user gets their own per-IP rate limit (a proxy would put
// everyone behind ours). It's a read, never a write (§0.5). It's only a
// convenience: if it fails, is slow or finds nothing, the field works as a
// plain text input, and accounts the AppView doesn't know can still type
// their full handle.
const TYPEAHEAD_URL = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead";
const TYPEAHEAD_MIN = 2;
const TYPEAHEAD_LIMIT = 6;
const DEBOUNCE_MS = 200;

type Suggestion = { did: string; handle: string; displayName?: string; avatar?: string };

const isSuggestion = (a: unknown): a is Suggestion =>
  !!a && typeof a === "object" && typeof (a as Suggestion).did === "string" && typeof (a as Suggestion).handle === "string";

// `next`: a path to land on after sign-in (validated again on the server).
export function LoginForm({ next = null }: { next?: string | null }) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const listId = useId();
  const inputId = useId();

  const term = handle.trim().replace(/^@/, "");

  useEffect(() => {
    const mine = ++seq.current;
    if (term.length < TYPEAHEAD_MIN) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q: term, limit: String(TYPEAHEAD_LIMIT) });
        const res = await fetch(`${TYPEAHEAD_URL}?${qs}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const actors: Suggestion[] = Array.isArray(data?.actors) ? data.actors.filter(isSuggestion) : [];
        // A response for an older term (aborts can race) is dropped.
        if (mine !== seq.current) return;
        setSuggestions(actors.slice(0, TYPEAHEAD_LIMIT));
        setActive(-1);
      } catch {
        if (mine === seq.current) setSuggestions([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  // Below the minimum, older suggestions are just not shown.
  const shown = term.length >= TYPEAHEAD_MIN ? suggestions : [];
  const expanded = open && !loading && shown.length > 0;

  async function signIn(h: string) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: h, next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      // Off to the user's PDS to approve; it redirects back to /oauth/callback.
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  // One tap: fill the handle and start sign-in straight away.
  function pick(s: Suggestion) {
    setHandle(s.handle);
    signIn(s.handle);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    signIn(handle);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (shown.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const n = shown.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        {/* Not wrapping the field: the label would then name it with the
            suggestions' text too. */}
        <label htmlFor={inputId}>
          <FieldLabel>Your Bluesky handle</FieldLabel>
        </label>
        {/* The list opens above the field: the form sits at the bottom of
            the screen, where the iOS keyboard would cover it. */}
        <div className="relative">
          <input
            id={inputId}
            type="text"
            name="handle"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder="alice.bsky.social"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            inputMode="url"
            disabled={loading}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            // 16px text stops iOS Safari zooming in on focus.
            className={`${input} h-13`}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggested accounts"
            hidden={!expanded}
            className="absolute inset-x-0 bottom-full z-10 mb-2 max-h-[min(20rem,45dvh)] overflow-y-auto rounded-control border border-border bg-surface py-1"
          >
            {shown.map((s, i) => (
              <li
                key={s.did}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the field, so blur doesn't close the list
                // before the tap lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex min-h-13 cursor-pointer items-center gap-3 px-3 py-1.5 active:bg-sunken ${
                  i === active ? "bg-sunken" : ""
                }`}
              >
                <SuggestionAvatar s={s} />
                <span className="min-w-0 flex-1">
                  {s.displayName && <span className="block truncate text-body font-semibold">{s.displayName}</span>}
                  <span className={`block truncate ${s.displayName ? "text-small text-muted" : "text-body font-semibold"}`}>
                    @{s.handle}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <button type="submit" disabled={loading || !handle.trim()} className={button({ size: "lg", full: true })}>
        {loading ? "Redirecting…" : "Sign in"}
      </button>
      <p className="text-small text-pretty text-muted">
        Any atproto account works. Your cooks are saved to your own account, not ours.
      </p>
    </form>
  );
}

// Bluesky's CDN avatar (the account isn't in our index yet, so our image
// proxy can't serve it), or the first letter if there's none or it fails.
function SuggestionAvatar({ s }: { s: Suggestion }) {
  const [failed, setFailed] = useState(false);
  if (s.avatar?.startsWith("https://") && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote, already small
      <img
        src={s.avatar}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full bg-sunken object-cover"
      />
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-accent uppercase"
      aria-hidden
    >
      {(s.displayName || s.handle).charAt(0)}
    </span>
  );
}
