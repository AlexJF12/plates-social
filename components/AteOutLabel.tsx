import { UtensilsCrossed } from "lucide-react";

// Marks a visit (Phase 6.8): a small terracotta pill. Information, not a
// control, so never basil.
export function AteOutLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-out-soft px-2.5 py-1 text-small font-semibold text-out ${className}`}
      data-testid="ate-out"
    >
      <UtensilsCrossed size={14} strokeWidth={2} aria-hidden />
      Ate out
    </span>
  );
}
