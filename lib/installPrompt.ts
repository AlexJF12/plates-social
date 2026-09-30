// Chrome's install prompt event (Android), not in lib.dom.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent;
  }
}

// Chrome can fire beforeinstallprompt before React hydrates. This inline
// script runs in <head> (app/layout.tsx), holds the event on window, and
// InstallHint picks it up on mount.
export const CAPTURE_INSTALL_PROMPT =
  "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e})";
