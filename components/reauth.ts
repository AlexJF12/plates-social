// Sign in again with the same account, to grant a scope the current
// session doesn't have (Post to Bluesky, visits), then come back to `next`.
// Resolves only if the redirect to sign-in has started.
export async function startReauth(viewerDid: string, next: string): Promise<void> {
  const res = await fetch("/oauth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: viewerDid, next }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(String(res.status));
  window.location.href = data.redirectUrl;
}
