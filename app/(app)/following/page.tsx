import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { PageHeader } from "@/components/PageHeader";
import { getSession } from "@/lib/auth/session";
import { resolveHandle } from "@/lib/identity";

// Manifest start_url. Placeholder until the following feed (Phase 4): shows
// who's signed in. Your own cooks are on your profile (Profile tab).
export default async function FollowingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const handle = await resolveHandle(session.did);

  return (
    <>
      <PageHeader title="Following" />
      <main className="mx-auto w-full max-w-md px-4 py-6">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold" data-testid="handle">
          @{handle}
        </p>
        <p className="mt-1 break-all text-xs text-muted">{session.did}</p>

        <p className="mt-6 text-sm text-muted">
          The following feed arrives in Phase 4. Meanwhile, see every cook on{" "}
          <Link href="/global" className="text-accent">
            Global
          </Link>
          .
        </p>

        <div className="mt-8">
          <LogoutButton />
        </div>
      </main>
    </>
  );
}
