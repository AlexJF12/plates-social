import { redirect } from "next/navigation";
import { TabBar } from "@/components/TabBar";
import { getDid } from "@/lib/auth/session";
import { getAccount } from "@/lib/db/queries";

// Signed-in screens: content plus the bottom tab bar. Each page still does
// its own sign-in check (layouts don't re-run on every navigation); this one
// makes a signed-out first load a plain 307, before the loading.tsx
// skeletons start streaming (a redirect from inside the stream is slower).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const did = await getDid();
  if (!did) redirect("/");
  const me = await getAccount(did);
  // Own profile can be reached by DID or handle; both count as the Profile tab.
  const profileHrefs = [`/profile/${me?.handle ?? did}`, `/profile/${did}`];

  return (
    <>
      <div className="flex flex-1 flex-col pb-16">{children}</div>
      <TabBar profileHrefs={profileHrefs} />
    </>
  );
}
