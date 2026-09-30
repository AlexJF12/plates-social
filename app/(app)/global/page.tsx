import Link from "next/link";
import { redirect } from "next/navigation";
import { CookFeed } from "@/components/CookFeed";
import { PageHeader } from "@/components/PageHeader";
import { getDid } from "@/lib/auth/session";
import { getCookFeed } from "@/lib/db/queries";

// Every cook indexed from the network, newest first (§2.1).
export default async function GlobalPage() {
  if (!(await getDid())) redirect("/");
  const initial = await getCookFeed({});

  return (
    <>
      <PageHeader title="Global" />
      <main className="mx-auto w-full max-w-md">
        <CookFeed
          initial={initial}
          empty={
            <div className="px-6 py-16 text-center">
              <p className="font-semibold">No cooks yet</p>
              <p className="mt-1 text-sm text-muted">Be the first to log what you made.</p>
              <Link href="/log" className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-semibold text-accent-foreground">
                Log a cook
              </Link>
            </div>
          }
        />
      </main>
    </>
  );
}
