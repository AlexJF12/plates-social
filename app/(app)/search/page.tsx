import { redirect } from "next/navigation";
import { SearchView } from "@/components/SearchView";
import { getDid } from "@/lib/auth/session";
import { searchCooks, searchPeople } from "@/lib/db/queries";
import { normalizeMeal, normalizeQuery } from "@/lib/search";

// Search dish names and people (Phase 6.6). The query lives in the URL
// (?q=&meal=), so Back and shared links keep it; a URL with a query is
// rendered with its first page of results.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const viewer = await getDid();
  if (!viewer) redirect("/");
  const params = await searchParams;
  const rawQ = typeof params.q === "string" ? params.q : "";
  const meal = normalizeMeal(typeof params.meal === "string" ? params.meal : null);
  const q = normalizeQuery(rawQ);
  const initial = q
    ? { people: meal ? [] : await searchPeople(q), ...(await searchCooks({ q, mealType: meal, viewer })) }
    : null;

  return <SearchView viewerDid={viewer} initialText={rawQ} initialMeal={meal} initial={initial} />;
}
