import Link from "next/link";
import { redirect } from "next/navigation";
import { LogCookForm } from "@/components/LogCookForm";
import { getDid } from "@/lib/auth/session";

export default async function LogPage() {
  if (!(await getDid())) redirect("/");

  return (
    <main className="flex flex-1 flex-col px-4 pb-8">
      <div className="mx-auto w-full max-w-md">
        {/* Standalone mode has no browser back button (§7.1). */}
        <header className="flex h-14 items-center justify-between">
          <Link href="/following" className="-ml-2 flex h-11 items-center px-2 text-base text-muted">
            Cancel
          </Link>
          <h1 className="text-base font-semibold">Log a cook</h1>
          <span className="w-16" />
        </header>
        <LogCookForm />
      </div>
    </main>
  );
}
