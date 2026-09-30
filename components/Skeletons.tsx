// Placeholders shown by the route loading.tsx files while a page renders on
// the server. Shapes follow the real layouts so nothing jumps when the
// content arrives.

const bar = "rounded bg-border motion-safe:animate-pulse";

function CardSkeleton() {
  return (
    <div className="border-b border-border pb-4">
      <div className="flex h-14 items-center gap-3 px-4">
        <span className={`h-8 w-8 rounded-full ${bar}`} />
        <span className={`h-3.5 w-32 ${bar}`} />
      </div>
      <div className={`aspect-[4/5] w-full rounded-none ${bar}`} />
      <div className="space-y-2 px-4 pt-3">
        <div className={`h-5 w-2/3 ${bar}`} />
        <div className={`h-3 w-16 ${bar}`} />
        <div className={`h-3.5 w-full ${bar}`} />
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4 px-4 py-5">
        <span className={`h-[72px] w-[72px] rounded-full ${bar}`} />
        <div className="space-y-2">
          <div className={`h-5 w-40 ${bar}`} />
          <div className={`h-3.5 w-28 ${bar}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        <div className={`h-[70px] rounded-xl ${bar}`} />
        <div className={`h-[70px] rounded-xl ${bar}`} />
      </div>
      <div className="px-4 pb-4">
        <div className={`h-11 w-32 rounded-lg ${bar}`} />
      </div>
      <CardSkeleton />
    </div>
  );
}

export function CookSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex h-14 items-center gap-3 px-4">
        <span className={`h-8 w-8 rounded-full ${bar}`} />
        <span className={`h-3.5 w-32 ${bar}`} />
      </div>
      <div className={`aspect-[4/5] w-full rounded-none ${bar}`} />
      <div className="space-y-2 px-4 pt-4">
        <div className={`h-7 w-3/4 ${bar}`} />
        <div className={`h-3 w-48 ${bar}`} />
        <div className={`h-3.5 w-full ${bar}`} />
        <div className={`h-3.5 w-5/6 ${bar}`} />
      </div>
    </div>
  );
}
