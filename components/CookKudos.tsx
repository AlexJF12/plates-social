"use client";

import { ChefHat } from "lucide-react";
import Link from "next/link";
import type { Author } from "@/lib/db/queries";
import { displayName, profilePath } from "@/lib/links";
import { Avatar } from "./Avatar";
import { useKudosToggle } from "./useKudosToggle";
import { ErrorText, button } from "./ui";

// Kudos on a cook: the count, who gave them, and the viewer's toggle (§6.6,
// logic in useKudosToggle). No toggle on your own cook.
export function CookKudos({
  cookUri,
  viewer,
  initialGiven,
  initialKudos,
  canGive,
}: {
  cookUri: string;
  viewer: Author;
  initialGiven: boolean;
  initialKudos: Author[];
  canGive: boolean;
}) {
  const { given, delta, pending, error, toggle } = useKudosToggle(cookUri, initialGiven);
  const kudos =
    delta > 0 ? [...initialKudos, viewer] : delta < 0 ? initialKudos.filter((k) => k.did !== viewer.did) : initialKudos;

  const shown = kudos.slice(0, 8);

  return (
    <section className="border-t-8 border-sunken px-4 py-5" aria-labelledby="kudos-h">
      <div className="flex min-h-11 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="kudos-h" className="text-body font-semibold" data-testid="kudos-count">
            {kudos.length} kudos
          </h3>
          {kudos.length > 0 && (
            <ul className="mt-2 flex -space-x-2">
              {shown.map((k) => (
                <li key={k.did} className="rounded-full ring-2 ring-background">
                  <Link href={profilePath(k)} title={displayName(k)} aria-label={displayName(k)}>
                    <Avatar author={k} size={32} />
                  </Link>
                </li>
              ))}
              {kudos.length > shown.length && (
                <li className="flex h-8 items-center pl-4 text-small text-muted">+{kudos.length - shown.length}</li>
              )}
            </ul>
          )}
        </div>
        {canGive && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={given}
            className={`${button({ variant: given ? "selected" : "primary" })} min-w-36`}
          >
            <ChefHat size={20} strokeWidth={2} fill={given ? "currentColor" : "none"} fillOpacity={0.2} aria-hidden />
            {pending ? "Saving…" : given ? "Kudos given" : "Give kudos"}
          </button>
        )}
      </div>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </section>
  );
}
