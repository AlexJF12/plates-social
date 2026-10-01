import { TabBar } from "./TabBar";
import { getAccount } from "@/lib/db/queries";

// Signed-in chrome: content plus the bottom tab bar. Used by the (app)
// layout and, for a signed-in viewer, by the public cook page's layout.
export async function AppShell({ did, children }: { did: string; children: React.ReactNode }) {
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
