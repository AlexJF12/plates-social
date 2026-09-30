import { redirect } from "next/navigation";
import { ImportFollows } from "@/components/ImportFollows";
import { PageHeader } from "@/components/PageHeader";
import { getDid } from "@/lib/auth/session";

// Bluesky import (§6.3). Shown once right after the first sign-in
// (?first=1, set by the OAuth callback) and reachable from your profile.
export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  if (!(await getDid())) redirect("/");
  const first = (await searchParams).first === "1";

  return (
    <>
      <PageHeader title="Find people" back={!first} />
      <main className="mx-auto w-full max-w-md">
        <ImportFollows first={first} />
      </main>
    </>
  );
}
