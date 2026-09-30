import { getPdsEndpoint } from "@atproto/common-web";
import { getDb } from "@/lib/db";
import { mealTypeLabel } from "@/lib/cook/mealTypes";
import { getTap } from "@/lib/tap";

// Phase 2 bare-bones list of the signed-in user's cooks, read from the
// index. Replaced by the profile page in Phase 3. Thumbnails load straight
// from the author's PDS until the image proxy (§6.5) exists.
async function pdsUrl(did: string): Promise<string | null> {
  try {
    const doc = await getTap().resolveDid(did);
    return (doc && getPdsEndpoint(doc)) || null;
  } catch {
    return null;
  }
}

export async function MyCooks({ did }: { did: string }) {
  const [cooks, pds] = await Promise.all([
    getDb()
      .selectFrom("cook")
      .select(["uri", "dishName", "mealType", "note", "images", "cookedAt"])
      .where("authorDid", "=", did)
      .orderBy("sortAt", "desc")
      .orderBy("uri", "desc")
      .limit(20)
      .execute(),
    pdsUrl(did),
  ]);

  if (cooks.length === 0) {
    return <p className="text-sm text-muted">No cooks yet. Log your first one.</p>;
  }

  return (
    <ul className="divide-y divide-border" data-testid="my-cooks">
      {cooks.map((c) => {
        const first = c.images[0];
        return (
          <li key={c.uri} className="flex gap-3 py-3">
            {pds && first ? (
              // eslint-disable-next-line @next/next/no-img-element -- temporary, until the Phase 3 image proxy
              <img
                src={`${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(first.cid)}`}
                alt={first.alt ?? ""}
                className="h-16 w-16 shrink-0 rounded-md bg-border object-cover"
              />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md bg-border" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.dishName}</p>
              <p className="text-xs text-muted">
                {mealTypeLabel(c.mealType)} · {c.cookedAt.slice(0, 16).replace("T", " ")} ·{" "}
                {c.images.length} photo{c.images.length === 1 ? "" : "s"}
              </p>
              {c.note && <p className="mt-1 line-clamp-2 text-sm">{c.note}</p>}
              <a
                href={`https://pdsls.dev/${c.uri}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent"
              >
                View record
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
