"use client";

import { useState } from "react";

export function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">
          Bluesky / atproto handle
        </span>
        <input
          type="text"
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="alice.bsky.social"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          inputMode="url"
          disabled={loading}
          // 16px text stops iOS Safari zooming in on focus.
          className="h-12 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !handle.trim()}
        className="h-12 w-full rounded-lg bg-accent font-semibold text-accent-foreground disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Sign in"}
      </button>
    </form>
  );
}
