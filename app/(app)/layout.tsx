import { TabBar } from "@/components/TabBar";
import { getDid } from "@/lib/auth/session";
import { getAccount } from "@/lib/db/queries";

// Signed-in screens: content plus the bottom tab bar. Each page still does
// its own sign-in check (layouts don't re-run on every navigation).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const did = await getDid();
  const me = did ? await getAccount(did) : null;
  // Own profile can be reached by DID or handle; both count as the Profile tab.
  const profileHrefs = did ? [`/profile/${me?.handle ?? did}`, `/profile/${did}`] : [];

  return (
    <>
      <div className="flex flex-1 flex-col pb-16">{children}</div>
      {did && <TabBar profileHrefs={profileHrefs} />}
    </>
  );
}
