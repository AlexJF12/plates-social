import { BackButton } from "./BackButton";

// Sticky top bar with the page title in the display serif. Detail screens
// get a back button (§7.1); `action` sits on the right.
export function PageHeader({
  title,
  back = false,
  action,
}: {
  title: string;
  back?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-md items-center gap-1 px-4">
        {back && <BackButton />}
        <h1 className="min-w-0 flex-1 truncate font-display text-dish">{title}</h1>
        {action}
      </div>
    </header>
  );
}
