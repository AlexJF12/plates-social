import { BestRedirect } from "@/components/BestRedirect";

// /best opens the viewer's current month, which only the browser knows
// (its time zone). The tab bar links straight to it once hydrated.
export default function BestPage() {
  return <BestRedirect />;
}
