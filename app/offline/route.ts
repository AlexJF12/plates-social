import { APP_NAME, THEME } from "@/lib/config";

// Offline fallback (§7.1), cached by public/sw.js and shown in place of a
// page that couldn't load. It is the only thing the service worker caches,
// so it must be self-contained: inline styles, no Next.js bundles (those
// aren't cached and wouldn't load offline). It's served at the URL that
// failed, so "Try again" is a reload.
export const dynamic = "force-static";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${APP_NAME}: offline</title>
<style>
  /* Self-contained copy of the app's tokens (no web font: nothing else is cached). */
  :root { --bg: ${THEME.light.background}; --fg: ${THEME.light.foreground}; --muted: ${THEME.light.muted}; --accent: ${THEME.light.accent}; --on-accent: ${THEME.light.accentForeground}; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: ${THEME.dark.background}; --fg: ${THEME.dark.foreground}; --muted: ${THEME.dark.muted}; --accent: ${THEME.dark.accent}; --on-accent: ${THEME.dark.accentForeground}; }
  }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    padding: env(safe-area-inset-top) 32px env(safe-area-inset-bottom);
    background: var(--bg); color: var(--fg); text-align: center;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 22px; line-height: 1.2; margin: 0; }
  p { margin: 8px auto 0; max-width: 20rem; color: var(--muted); font-size: 16px; line-height: 1.45; }
  button {
    margin-top: 24px; min-height: 44px; min-width: 200px; padding: 0 16px; border: 0; border-radius: 12px;
    background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600;
  }
  button:active { transform: scale(0.97); }
</style>
</head>
<body>
<main>
  <h1>You're offline</h1>
  <p>${APP_NAME} needs a connection to load this page.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
