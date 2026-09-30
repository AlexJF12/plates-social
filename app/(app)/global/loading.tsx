import { PageHeader } from "@/components/PageHeader";
import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <>
      <PageHeader title="Global" />
      <main className="mx-auto w-full max-w-md">
        <FeedSkeleton />
      </main>
    </>
  );
}
