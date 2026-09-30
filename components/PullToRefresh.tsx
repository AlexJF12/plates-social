"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErrorText } from "./ui";

// Pull to refresh (Phase 6.7). At the top of the page, a downward touch pull
// opens a gap above the list with a round badge whose circular arrow turns
// as you pull; past THRESHOLD it turns accent (let go to refresh), and on
// release it spins while onRefresh runs. Touch only, vertical only, never
// while a dialog is open. The browser's own pull/bounce is switched off on
// the page while this is mounted (§7.1), so the two don't fight.

const THRESHOLD = 64; // px of gap (after resistance)
const MAX = 112;
const RESISTANCE = 0.5; // the gap grows half as fast as the finger moves
const HOLD = 56; // gap kept open while refreshing

type Phase = "idle" | "pulling" | "refreshing" | "failed";

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const refreshing = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let distance = 0;

    const onStart = (e: TouchEvent) => {
      if (refreshing.current || e.touches.length !== 1 || window.scrollY > 0) return;
      if (document.querySelector("dialog[open]")) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!dragging) {
        // Decide once: a sideways swipe (photo carousel) or an upward
        // scroll is left alone.
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) return void (start = null);
        if (dy < -4) return void (start = null);
        if (dy < 8) return;
        dragging = true;
        setPhase("pulling");
      }
      if (e.cancelable) e.preventDefault(); // no page scroll or bounce meanwhile
      distance = Math.min(MAX, Math.max(0, (dy - 8) * RESISTANCE));
      setPull(distance);
    };
    const onEnd = async () => {
      if (!start) return;
      start = null;
      if (!dragging) return;
      dragging = false;
      if (distance < THRESHOLD) {
        setPhase("idle");
        setPull(0);
        return;
      }
      refreshing.current = true;
      setPhase("refreshing");
      setPull(HOLD);
      try {
        await onRefreshRef.current();
        setPhase("idle");
        window.scrollTo({ top: 0 });
      } catch {
        setPhase("failed");
      } finally {
        refreshing.current = false;
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = before;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const armed = pull >= THRESHOLD;
  const active = phase === "pulling" || phase === "refreshing";

  return (
    <div>
      <div
        className={`flex items-center justify-center overflow-hidden ${
          phase === "pulling" ? "" : "motion-safe:transition-[height] motion-safe:duration-200"
        }`}
        style={{ height: pull }}
        aria-hidden={!active}
        data-testid="pull-indicator"
        data-state={phase === "refreshing" ? "refreshing" : armed ? "armed" : active ? "pulling" : "idle"}
      >
        {active && (
          <span className="flex items-center gap-2">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface ${
                armed || phase === "refreshing" ? "text-accent" : "text-muted"
              }`}
            >
              <RefreshCw
                size={20}
                strokeWidth={2.2}
                // Turns with the pull, then spins while refreshing.
                style={phase === "refreshing" ? undefined : { transform: `rotate(${Math.min(pull, THRESHOLD) * 4}deg)` }}
                className={phase === "refreshing" ? "motion-safe:animate-spin" : ""}
                aria-hidden
              />
            </span>
            {phase === "refreshing" && <span className="hidden text-small text-muted motion-reduce:inline">Refreshing…</span>}
          </span>
        )}
      </div>
      <p role="status" className="sr-only">
        {phase === "refreshing" ? "Refreshing" : ""}
      </p>
      {phase === "failed" && (
        <ErrorText className="px-4 py-2 text-center">Couldn&apos;t refresh. Pull down to try again.</ErrorText>
      )}
      {children}
    </div>
  );
}
