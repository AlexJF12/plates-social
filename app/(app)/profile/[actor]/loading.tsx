import { PageHeader } from "@/components/PageHeader";
import { ProfileSkeleton } from "@/components/Skeletons";

// No back button: it isn't known yet whether this is your own profile
// (which has none), and the tab bar is there as a way out meanwhile.
export default function Loading() {
  return (
    <>
      <PageHeader title="" />
      <main className="mx-auto w-full max-w-md">
        <ProfileSkeleton />
      </main>
    </>
  );
}
