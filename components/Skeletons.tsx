// Placeholders shown by the route loading.tsx files while a page renders on
// the server. Shapes follow the real layouts so nothing jumps when the
// content arrives.

const bar = "rounded bg-border motion-safe:animate-pulse";

function AuthorRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`h-10 w-10 rounded-full ${bar}`} />
      <div className="space-y-1.5">
        <div className={`h-4 w-32 ${bar}`} />
        <div className={`h-3.5 w-20 ${bar}`} />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="border-b-8 border-sunken pb-4">
      <AuthorRow />
      <div className={`aspect-[4/5] w-full rounded-none ${bar}`} />
      <div className="space-y-2.5 px-4 pt-4">
        <div className={`h-6 w-2/3 ${bar}`} />
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-4/5 ${bar}`} />
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
      <div className="flex items-center gap-4 px-4 pt-2 pb-6">
        <span className={`h-20 w-20 rounded-full ${bar}`} />
        <div className="space-y-2">
          <div className={`h-7 w-40 ${bar}`} />
          <div className={`h-4 w-28 ${bar}`} />
        </div>
      </div>
      <div className="flex gap-5 px-4 pb-5">
        <div className={`h-16 flex-1 ${bar}`} />
        <div className={`h-16 flex-1 ${bar}`} />
      </div>
      <div className="px-4 pb-5">
        <div className={`h-11 w-full rounded-control ${bar}`} />
      </div>
      <div className="border-t-8 border-sunken">
        <CardSkeleton />
      </div>
    </div>
  );
}

export function CookSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <AuthorRow />
      <div className={`aspect-[4/5] w-full rounded-none ${bar}`} />
      <div className="space-y-2.5 px-4 pt-5">
        <div className={`h-8 w-3/4 ${bar}`} />
        <div className={`h-4 w-48 ${bar}`} />
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-5/6 ${bar}`} />
      </div>
    </div>
  );
}
