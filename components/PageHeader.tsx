import { BackButton } from "./BackButton";

// Sticky top bar. Detail screens get a back button (§7.1).
export function PageHeader({ title, back = false }: { title: string; back?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-md items-center gap-1 px-4">
        {back && <BackButton />}
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </div>
    </header>
  );
}
