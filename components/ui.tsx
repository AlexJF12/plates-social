// Shared UI primitives (Phase 6.5 design system). Everything here uses the
// tokens in app/globals.css; components shouldn't invent their own sizes,
// colors or radii. Plain module (no "use client") so both server and client
// components can use it.

type ButtonVariant = "primary" | "secondary" | "selected" | "quiet" | "subtle" | "danger" | "destructive";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold select-none " +
  "transition-[transform,opacity,background-color] duration-100 motion-safe:active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-45 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground",
  secondary: "border border-border bg-surface text-foreground active:bg-sunken",
  // A toggle that's on (kudos given, following).
  selected: "border border-accent bg-accent-soft text-accent",
  quiet: "text-accent active:opacity-70",
  // Low-stakes actions that shouldn't draw the eye (sign out, skip).
  subtle: "text-muted active:opacity-70",
  danger: "border border-border bg-surface text-danger active:bg-sunken",
  // The confirm button inside a delete dialog.
  destructive: "bg-danger text-background",
};

// Class names for a button, or a Link styled as one. Every size keeps the
// 44px minimum tap target (§7).
export function button({
  variant = "primary",
  size = "md",
  full = false,
}: { variant?: ButtonVariant; size?: "md" | "lg"; full?: boolean } = {}) {
  const sizing = size === "lg" ? "h-13 px-6 text-lead" : "h-11 px-4 text-body";
  return `${base} ${variants[variant]} ${sizing} ${full ? "w-full" : ""}`;
}

// Selectable pill (meal types).
export function chip(selected: boolean) {
  return (
    "inline-flex h-11 items-center rounded-full border px-4 text-body font-medium transition-colors duration-100 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    (selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground")
  );
}

// Text inputs and textareas.
export const input =
  "w-full rounded-control border border-border bg-surface px-4 text-body text-foreground outline-none " +
  "placeholder:text-muted focus:border-accent disabled:opacity-60";

export function FieldLabel({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className="mb-2 block text-small font-semibold">
      {children}
      {optional && <span className="font-normal text-muted"> (optional)</span>}
    </span>
  );
}

export function ErrorText({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={`text-small text-danger ${className}`}>
      {children}
    </p>
  );
}

// Empty lists, not-found and error screens: a serif line saying what's
// (not) here, one sentence of direction, then what to do about it.
export function EmptyState({
  title,
  children,
  actions,
  className = "",
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-8 py-16 text-center ${className}`}>
      <h2 className="font-display text-dish text-balance">{title}</h2>
      {children && <p className="mt-2 max-w-xs text-body text-pretty text-muted">{children}</p>}
      {actions && <div className="mt-6 flex w-full max-w-xs flex-col items-stretch gap-2">{actions}</div>}
    </div>
  );
}
