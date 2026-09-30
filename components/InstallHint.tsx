"use client";

import { useEffect, useState } from "react";
import type { BeforeInstallPromptEvent } from "@/lib/installPrompt";

// Install hint (§7.1), shown once until dismissed and never inside the
// installed app. iOS has no install prompt, so mobile Safari gets
// instructions. Android Chrome fires beforeinstallprompt, which we hold on
// to and replay from an Install button.

type Hint = { kind: "ios" } | { kind: "android"; event: BeforeInstallPromptEvent } | null;

const DISMISSED_KEY = "installHintDismissed";

// Storage can be unavailable (private mode, blocked site data); then the
// hint just shows again next time.
function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {}
}

function isStandalone() {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    matchMedia("(display-mode: standalone)").matches
  );
}

// Safari on iPhone/iPad. iPadOS reports a Mac user agent, but Macs have no
// touch points. Other iOS browsers and in-app web views are excluded: the
// instructions are for Safari's Share button.
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

export function InstallHint() {
  const [hint, setHint] = useState<Hint>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;
    // Browser-only checks, so they run after hydration (the server renders
    // nothing here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIosSafari()) setHint({ kind: "ios" });
    if (window.__installPrompt) setHint({ kind: "android", event: window.__installPrompt });

    const onPrompt = (e: Event) => {
      // Hold Chrome's own prompt for our button.
      e.preventDefault();
      setHint({ kind: "android", event: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => setHint(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!hint) return null;

  function dismiss() {
    rememberDismissed();
    setHint(null);
  }

  async function install(event: BeforeInstallPromptEvent) {
    await event.prompt();
    // The event can only be used once; either way, don't offer it again.
    await event.userChoice;
    dismiss();
  }

  return (
    <aside
      aria-label="Install the app"
      className="flex items-center gap-2 border-b border-border bg-surface py-2 pr-1 pl-4"
      data-testid="install-hint"
    >
      <p className="flex-1 text-sm">
        {hint.kind === "ios" ? (
          <>
            <span className="font-semibold">Add to Home Screen:</span> tap Share{" "}
            <ShareIcon />, then Add to Home Screen.
          </>
        ) : (
          <>Install the app for quick access from your home screen.</>
        )}
      </p>
      {hint.kind === "android" && (
        <button
          type="button"
          onClick={() => install(hint.event)}
          className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </aside>
  );
}

// Safari's Share glyph, so people can spot the button.
function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block -translate-y-0.5 align-middle"
      aria-label="(the square with an arrow)"
      role="img"
    >
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
