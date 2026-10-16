import { MapPin } from "lucide-react";

// A visit's area under the restaurant name, with a pin so it reads as a
// place at a glance. Muted like the text: information, not a control.
export function RestaurantArea({ area, className = "" }: { area: string; className?: string }) {
  return (
    <p className={`flex items-start gap-1 text-muted break-words ${className}`}>
      <MapPin size="1em" strokeWidth={2} className="mt-[0.2em] shrink-0" aria-hidden />
      <span className="min-w-0">{area}</span>
    </p>
  );
}
