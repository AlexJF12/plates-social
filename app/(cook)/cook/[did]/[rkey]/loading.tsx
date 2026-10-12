import { PageHeader } from "@/components/PageHeader";
import { CookSkeleton } from "@/components/Skeletons";

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
