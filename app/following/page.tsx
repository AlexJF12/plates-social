import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { MyCooks } from "@/components/MyCooks";
import { getSession } from "@/lib/auth/session";
import { resolveHandle } from "@/lib/identity";

// Manifest start_url. Placeholder until the following feed (Phase 4): shows
// who's signed in and, since Phase 2, their own cooks.
export default async function FollowingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const handle = await resolveHandle(session.did);

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold" data-testid="handle">
          @{handle}
        </p>
        <p className="mt-1 break-all text-xs text-muted">{session.did}</p>

        <Link
          href="/log"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-accent font-semibold text-accent-foreground"
        >
          Log a cook
        </Link>

        <h2 className="mt-8 mb-1 text-base font-semibold">My cooks</h2>
        <MyCooks did={session.did} />

        <div className="mt-8">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
