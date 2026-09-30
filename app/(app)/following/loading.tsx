import { FeedHeader } from "@/components/FeedHeader";
import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <>
      <FeedHeader current="/following" />
      <main className="mx-auto w-full max-w-md">
        <FeedSkeleton />
      </main>
    </>
  );
}
