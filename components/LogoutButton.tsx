"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { button } from "./ui";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/oauth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={button({ variant: "subtle" })}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
