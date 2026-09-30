import { Trophy } from "lucide-react";
import { type Badge, badgeLabel } from "@/lib/cook/best";

// "Best dinner, Sep 2026" on a cook that won a completed month (Phase 6.6).
export function BestBadge({ badge, className = "" }: { badge: Badge; className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-small font-semibold ${className}`} data-testid="best-badge">
      <Trophy size={16} strokeWidth={2} aria-hidden />
      {badgeLabel(badge)}
    </p>
  );
}
