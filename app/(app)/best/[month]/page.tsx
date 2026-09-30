import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BestHeader, BestStatus } from "@/components/BestHeader";
import { BestList } from "@/components/BestList";
import { EmptyState, button } from "@/components/ui";
import { getDid } from "@/lib/auth/session";
import { formatMonth, isMonth, latestStartedMonth } from "@/lib/cook/best";
import { getBestOfMonth, getEarliestCookMonth } from "@/lib/db/queries";

// Best cook of a month (Phase 6.6): per meal type, the cook with the most
// kudos, computed from the index on every load.
export default async function BestMonthPage({ params }: PageProps<"/best/[month]">) {
  if (!(await getDid())) redirect("/");
  const { month } = await params;
  // No month can have cooks before it has started somewhere (UTC+14).
  if (!isMonth(month) || month > latestStartedMonth()) notFound();
  const [best, earliest] = await Promise.all([getBestOfMonth(month), getEarliestCookMonth()]);

  return (
    <>
      <BestHeader month={month} earliest={earliest} />
      <main className="mx-auto w-full max-w-md">
        {best.some((b) => b.cook) ? (
          <>
            <BestStatus month={month} />
            <BestList best={best} />
          </>
        ) : (
          <EmptyState
            title={`No winners in ${formatMonth(month)}`}
            actions={
              <Link href="/global" className={button({ variant: "secondary" })}>
                See the global feed
              </Link>
            }
          >
            The cook with the most kudos in each meal wins. Give kudos to cooks you like.
          </EmptyState>
        )}
      </main>
    </>
  );
}
