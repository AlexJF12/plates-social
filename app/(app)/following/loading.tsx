import { PageHeader } from "@/components/PageHeader";
import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <>
      <PageHeader title="Following" />
      <main className="mx-auto w-full max-w-md">
        <FeedSkeleton />
      </main>
    </>
  );
}
