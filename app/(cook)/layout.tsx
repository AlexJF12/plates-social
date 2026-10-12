import { AppShell } from "@/components/AppShell";
import { getDid } from "@/lib/auth/session";

// A single cook is public, so shared links work for anyone. Signed in: the
// usual tab bar. Signed out: no tab bar; the page offers sign-in itself.
export default async function CookLayout({ children }: LayoutProps<"/">) {
  const did = await getDid();
  if (!did) return <div className="flex flex-1 flex-col">{children}</div>;
  return <AppShell did={did}>{children}</AppShell>;
}
