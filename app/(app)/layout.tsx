import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getDid } from "@/lib/auth/session";

// Signed-in screens: content plus the bottom tab bar. Each page still does
// its own sign-in check (layouts don't re-run on every navigation); this one
// makes a signed-out first load a plain 307, before the loading.tsx
// skeletons start streaming (a redirect from inside the stream is slower).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const did = await getDid();
  if (!did) redirect("/");
  return <AppShell did={did}>{children}</AppShell>;
}
