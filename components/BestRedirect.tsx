"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BestSkeleton } from "./Skeletons";
import { useViewerToday } from "./useViewerToday";

export function BestRedirect() {
  const router = useRouter();
  const today = useViewerToday();
  useEffect(() => {
    if (today) router.replace(`/best/${today.slice(0, 7)}`);
  }, [router, today]);
  return <BestSkeleton />;
}
