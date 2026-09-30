"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

// Bottom tabs (§7): Following, Global, Log (primary), Profile. Padded clear
// of the home indicator (§7.1).
export function TabBar({ profileHrefs }: { profileHrefs: string[] }) {
  const path = usePathname();
  const tabs = [
    { href: "/following", label: "Following", icon: icon("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), active: path === "/following" },
    { href: "/global", label: "Global", icon: icon("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"), active: path === "/global" },
    { href: "/log", label: "Log", primary: true, active: path === "/log" },
    { href: profileHrefs[0], label: "Profile", icon: icon("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"), active: profileHrefs.includes(decodeURIComponent(path)) },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 pb-safe backdrop-blur">
      <ul className="mx-auto flex h-16 max-w-md items-stretch">
        {tabs.map((t) => (
          <li key={t.label} className="flex-1">
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${t.active ? "text-foreground" : "text-muted"}`}
            >
              {t.primary ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  {icon("M12 5v14M5 12h14")}
                </span>
              ) : (
                t.icon
              )}
              {!t.primary && t.label}
              {t.primary && <span className="sr-only">{t.label}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
