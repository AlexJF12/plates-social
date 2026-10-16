import { PageHeader } from "@/components/PageHeader";
import { CookSkeleton } from "@/components/Skeletons";

// Same shape as a cook's page: author row, photo, title, text.
export default function Loading() {
  return (
    <>
      <PageHeader title="" back />
      <main className="mx-auto w-full max-w-md">
        <CookSkeleton />
      </main>
    </>
  );
}
