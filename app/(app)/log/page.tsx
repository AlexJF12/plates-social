import { redirect } from "next/navigation";
import { LogCookForm } from "@/components/LogCookForm";
import { PageHeader } from "@/components/PageHeader";
import { getDid } from "@/lib/auth/session";
import Link from "next/link";
import { button } from "@/components/ui";

export default async function LogPage() {
  if (!(await getDid())) redirect("/");

  return (
    <>
      {/* Standalone mode has no browser back button (§7.1). */}
      <PageHeader
        title="Log a cook"
        action={
          <Link href="/following" className={`${button({ variant: "subtle" })} -mr-3`}>
            Cancel
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-md px-4 pt-2 pb-8">
        <LogCookForm />
      </main>
    </>
  );
}
