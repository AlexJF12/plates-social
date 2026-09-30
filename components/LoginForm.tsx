"use client";

import { useState } from "react";
import { ErrorText, FieldLabel, button, input } from "./ui";

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
        <FieldLabel>Your Bluesky handle</FieldLabel>
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
          className={`${input} h-13`}
        />
      </label>

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
