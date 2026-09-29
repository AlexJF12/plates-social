import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth/session";
import { resolveHandle } from "@/lib/identity";

// Manifest start_url. Phase 0 placeholder: shows who's signed in. The
// following feed replaces this in Phase 4.
export default async function FollowingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const handle = await resolveHandle(session.did);

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-sm">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold" data-testid="handle">
          @{handle}
        </p>
        <p className="mt-1 break-all text-xs text-muted">{session.did}</p>
        <div className="mt-8">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
