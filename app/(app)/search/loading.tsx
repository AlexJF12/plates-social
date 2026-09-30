import { FeedSkeleton } from "@/components/Skeletons";

// The field and chips come with the page; meanwhile, cards.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md pt-28">
      <FeedSkeleton />
    </main>
  );
}
