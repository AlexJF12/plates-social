# Progress

## Current phase: 4 — Follows ⏸ checkpoint, verified, awaiting review (2026-09-29)

Branch: `feature/phase-4-follows`

### Built

- `POST /api/follow` `{subject, rkey}`: follow. Client-generated TID rkey (reused on retry, same pattern as cooks): if `create` throws, `get` at that rkey returns the landed record. Already following in the index → returns the existing uri (double tap can't duplicate). Self/invalid DID → 400.
- `DELETE /api/follow` `{subject}`: looks up the viewer's follow in the index, `deleteRecord`, deletes the row. Not following → `{deleted: null}`, 200.
- `GET /api/follow/import`: the viewer's `app.bsky.graph.follow` subjects via unauthenticated `listRecords` on their PDS (`lib/follows/bluesky.ts`: 100/page, ≤100 pages, 10 s timeout per page, repeated-cursor guard, non-DID subjects skipped), intersected with `getImportCandidates` (active accounts with ≥1 cook, not self, not already followed).
- `POST /api/follow/import` `{subjects}`: re-filters through `getImportCandidates` (so only candidates, deduped, minus already-followed), then `followMany` (`lib/follows/write.ts`): `applyWrites` in batches of 100, each batch indexed as soon as it lands; a failed batch → 502 `{followed, remaining}`, and a retry only writes what's missing.
- Read-your-own-writes for every follow write (`upsertFollow`, plus `ensureAccount` for the author).
- `getCookFeed({ followedBy })`: own cooks + cooks by accounts followed in this app, same cursor paging; `/api/feed?feed=following` (401 when signed out).
- `/following`: real feed (replaces the placeholder). Empty state links to `/import` and `/global`.
- Profile: others get `FollowButton` (flips only after the server confirms; "Saving…" while pending; inline error on failure). Your own profile gets "Find people from Bluesky" and **Sign out** (moved from the old `/following` placeholder).
- `/import` + `components/ImportFollows.tsx`: loads the candidate list client-side (loading, error + Retry), avatars, all pre-selected, sticky "Follow all" / "Follow N" button, "Retry" after a failure. Success → `/following`.
- **First-login flow:** migration `003_login` (`login(did, firstAt)`). The OAuth callback inserts the DID; if the row is new it redirects to `/import?first=1` (no back button, a Skip link to `/global`); with no candidates that page `replace`s to `/global` (§6.3).
- `lib/pds.ts`: `safePdsUrl` + `resolvePds` moved out of the image proxy so the import reuses the same SSRF rules.
- Removed `lib/identity.ts` (`resolveHandle`): its only caller was the old `/following` placeholder.
- Tests: `lib/follows/bluesky.test.ts` (paging, dedupe, invalid subjects, repeated cursor, empty page, PDS errors), `lib/follows/write.test.ts` (250 follows → 100/100/50 `applyWrites`, every op indexed with the right uri/subject; failure mid-way keeps the landed batch), `lib/db/queries.test.ts` (+4: following feed contents/order/paging, inactive/unfollowed drop out, `getFollowUri`, import candidate rules).

### Decisions not in the spec

- **`login` table** (`003_login`) to know "first login" server-side, so the import shows once per account, not once per device (iOS home-screen apps have separate cookies). It isn't user content and isn't part of the rebuildable index (the rebuild script leaves it alone); losing it only means the import is offered once more. Your DID has no row yet, so **your next sign-in counts as a first login**.
- Import list is fetched client-side (reading follows takes ~0.4 s for 256 follows; bigger accounts are slower), so there's a real loading/error state.
- Bluesky follows are capped at 10,000 (100 pages). Past that, the rest are ignored.
- The import POST only follows accounts that are candidates at that moment; arbitrary DIDs can't be bulk-followed through it.
- Unfollow isn't confirmed with a dialog (§6.6 asks confirmation for deleting cooks/comments only).
- Button label is "Follow all" when everything is selected, "Follow N" otherwise.
- Sign out now lives on your own profile.

### Verified (and how)

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm test`: 93/93. `pnpm test:e2e`: 8/8. The following-feed test was mutation-checked (dropping the own-cooks clause fails it).
- `listBskyFollows` live against the human's PDS (`matsutake.us-west.host.bsky.network`): 256 DIDs, identical to a direct paginated `listRecords` count.
- curl, signed out: `/api/follow` POST, `/api/follow/import` GET/POST, `/api/feed?feed=following` → 401; `/following`, `/import` → 307 to sign-in.
- **Live writes to the human's repo (approved), minted cookie, through the dev server:**
  - Follow: invalid subject/self/bad rkey/junk → 400; follow → 200; `getRecord` fields correct; retry → same uri, still 1 record. **Lost-response path:** deleted the index row, re-POSTed the same rkey → 200 same uri, PDS still 1 record with the original `createdAt`.
  - **Tap, not only read-your-own-writes:** deleted the row, then Tap `/repos/remove` + `/repos/add` → row back in 3 s with the same uri/createdAt. Every follow/unfollow was followed by a `POST /api/webhook 200` in the dev log.
  - Unfollow → `getRecord` RecordNotFound, row gone; second unfollow → `{deleted: null}`.
  - Import (with 2 **local-only fixture** accounts+cooks for two real Bluesky follows, since the human is the only cook author): subjects `[F1, F2, F1 dup, self, non-candidate]` → `{followed: 2}`, one `applyWrites` with 2 creates works under the granular `repo:` scope; `listRecords` shows both; repeat import → `{followed: 0}`; candidate list then empty; following feed shows their cooks. Wiped rows → Tap backfill restored both in 2 s.
  - Cleanup: all follow records deleted (PDS `listRecords` empty, `follow` table empty); fixtures removed.
- Playwright at 375px, light + dark (throwaway specs, deleted): `/following` (feed + active tab), own profile (import link + sign out, no follow button), other profile (Follow), `/import` (2 pre-selected, Follow all → Follow 1 → Follow 0 disabled, back button), `/import?first=1` (no back, Skip → /global), empty following feed (cookie for a DID with nothing). No horizontal scroll, no console errors, no failed images. Screenshots reviewed. UI round trip: Following→Follow on both profiles, Follow all → lands on `/following` with their cooks, unfollow again.
- Image proxy after the `lib/pds.ts` move: forced cache miss on the avatar → 200 WebP.
- **Not verified:** the first-login redirect through a real OAuth sign-in (needs the human; see next step). Phone testing of this phase.

### Known issues

- A duplicate follow record (e.g. two devices following at once) is kept out of the index by keep-earliest; unfollow deletes only the indexed one, so the duplicate resurfaces after a rebuild. Same known edge as kudos (Phase 3).
- A lost response on an import batch followed by a retry can create duplicate follow records (the batch rkeys are server-generated). Same effect as above.
- Carried: quick-tunnel URL changes; `auth_state` never pruned; Lexicon `mealType` minLength decision still open; Tap's webhook retry has no visible backoff.

### Next step

Human reviews the Phase 4 checkpoint and does the manual steps (sign out, sign in from the installed app → lands on Global via the first-login import skip; Follow/Unfollow from a profile if a second cook author exists). Then commit/PR. Then Phase 5: kudos, comments, delete, orphan hiding.

---

## Phase 3 — Sync, global feed, profiles, images ✅ complete (merged, PR #4)

Branch: `feature/phase-3`

### Built

- `POST /api/webhook` (Statusphere pattern): `assureAdminAuth`, `parseTapEvent(jsonToLex(body))`, then `indexEvent`. 200 = ack. Records that fail validation get 200 + a `webhook: dropped …` log (otherwise Tap retries forever); DB errors get 500 so Tap redelivers.
- `lib/indexer/index.ts` `indexEvent(db, evt)`: one dispatcher for all events.
  - cook/kudos/comment/follow: `$parse` against our Lexicons, rkey must be a TID, kudos/comment subject must be an `NS.cook` URI. create/update = idempotent upsert; delete by uri.
  - `app.bsky.actor.profile` (rkey `self` only, validated with the installed Bluesky Lexicon): displayName + avatarCid on `account`; delete clears them.
  - identity: handle (Tap-verified; `handle.invalid` → null) + active. `deleted` → purge every row the DID authored (not others' rows about it). takendown/suspended/deactivated → `active=false`, rows kept, hidden everywhere.
- `lib/indexer/{kudos,follow,comment,account}.ts`: row builders + upserts, all single idempotent statements. Kudos/follow: one per (author, subject), earliest `createdAt` wins regardless of arrival order. Comment `sortAt = min(createdAt, indexedAt)`, kept on update (same as cooks).
- `lexicons/app/bsky/actor/profile.json` (+ `com.atproto.label.defs`) via `lex install`, re-exported as `bskyProfile` from `lib/lexicons.ts`.
- Image proxy `GET /api/img/[did]/[cid]?size=avatar|thumb|full` (`lib/image/proxy.ts`): serves only CIDs referenced by an indexed cook or avatar of an **active** account (checked every request, so deleted cooks stop serving); PDS from the DID doc via Tap, https + non-IP hosts only; 5 MB cap, 15 s timeout; **bytes verified against the CID**; sharp sniffs the real format, resizes (avatar 128² cover, thumb ≤1080 wide, full ≤2000), WebP; disk cache `.cache/img/<cid>-<size>.webp` (atomic write, in-flight dedupe); `Cache-Control: public, max-age=31536000, immutable`; 404/502 are `no-store`.
- Read queries `lib/db/queries.ts`: `getCookFeed` (global or per author; cursor `sortAt~uri`, 20/page, row comparison), `getAccount` (DID or handle), `getCookDetail` (kudos givers + first 50 comments). Kudos/comment counts exclude hidden authors.
- `GET /api/feed?cursor=&author=` for infinite scroll.
- UI (route group `app/(app)/` with a bottom tab bar: Following, Global, Log (primary), Profile):
  - `/global`: feed cards per §7 (author row, relative time, edge-to-edge scroll-snap carousel with dots, 4:5 max crop from the first photo, dish, meal label, note clamped to 3 lines, counts). Infinite scroll with loading/error+retry.
  - `/profile/[actor]` (handle or DID): avatar, name, handle, their cooks. Back button unless it's you.
  - `/cook/[did]/[rkey]`: every photo at full aspect ratio, dish, meal type, "Cooked …" in the author's own wall-clock time (`formatCookedAt`), full note, kudos avatars, comments (read-only).
  - `/following` placeholder slimmed down (MyCooks removed; your cooks are on your profile). After posting, the log form now goes to the new cook's page.
- `/api/cook` (Phase 2) also calls `ensureAccount` so a read-your-own-writes cook shows before Tap's identity event.
- `pnpm rebuild-index [--yes] [extra DIDs]` (`scripts/rebuild-index.mts`) + README "Rebuilding the index".
- Tests: `lib/indexer/index.test.ts` (18, real Postgres in rolled-back transactions via `lib/db/testing.ts`), `lib/db/queries.test.ts` (4), `formatCookedAt` (2).

### Decisions not in the spec

- A third proxy size, `avatar` (128px), so feeds don't load 1000px avatars. Output is always WebP.
- Proxy verifies blob bytes against the CID before caching forever; refuses non-https / IP-literal / localhost PDS endpoints (SSRF). DNS-rebinding to private IPs is **not** blocked yet (Phase 7 hardening item).
- Kudos and comments whose subject isn't an `NS.cook` URI are dropped at index time (Lexicon only says strongRef).
- Kudos/follow "keep earliest" = earliest `createdAt`. Known edge: if the kept one is deleted, the author's other duplicate isn't re-surfaced until a rebuild.
- Content from a DID with no identity event yet is shown (`ensureAccount` inserts active=true, handle null → DID shown until Tap's identity event). In practice Tap sends identity events on backfill.
- App pages require sign-in (cookie check only, `getDid`); `/api/feed` and `/api/img` are public (the data is public on the network).
- Feed time is relative post time (`sortAt`); detail also shows the author-local "Cooked" time.
- Detail comments: first 50, no paging yet (paging comes with posting comments in Phase 5).
- Bottom tab bar added now (pages needed navigation); full design pass stays in Phase 6.
- Rebuild = truncate index + Tap `/repos/remove` then `/repos/add` per DID (verified that this triggers a full re-backfill).

### Verified (and how)

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm test`: 84/84. `pnpm test:e2e`: 8/8.
- **Idempotency test** (`lib/indexer/index.test.ts`): each event type (identity, profile, cook, kudos, comment, follow, deletes) applied, then replayed with a later clock → snapshot of all test-DID rows identical; whole-stream replay identical; Tap delivery after read-your-own-writes identical. Mutation-checked: re-stamping sortAt on replay, or dropping the keep-earliest rule, makes tests fail.
- **Tap end to end:** when the route came up, Tap drained its 7-event backlog (identity + profile + 5 cooks) with 200s: handle/displayName/avatar arrived; cooks were no-ops (indexedAt unchanged from Phase 2's upsert).
- curl on `/api/webhook`: no auth / wrong password → 401; garbage → 200 dropped; invalid cook → 200 dropped (logged reason); valid → indexed; replay → row unchanged; delete → row gone. (Throwaway test DID, cleaned up.)
- curl on `/api/img`: avatar/thumb/full → 200 WebP 128² / 1080×810 / 2000×1500, immutable; second hit 8 ms from cache; unreferenced CID, wrong DID → 404 no-store; bad size/`constructor`/cid/did → 400. CID check rejects mismatched bytes.
- `/api/feed`: 5 cooks with counts; bad author → 400; garbage cursor ignored. Paging 45 cooks with sortAt ties → 20/20/5, no gaps or repeats (test).
- **Index rebuild run locally:** `pnpm rebuild-index --yes` → rows 1/5/0/0/0 before and after, and a dump of every column except indexedAt/updatedAt was identical.
- Playwright at 375px, light + dark, signed in via a minted cookie (human approved): `/global`, `/profile/<handle>`, `/profile/<did>`, `/cook/…`, `/following`, `/log` → 200, no console/hydration errors, no horizontal scroll, every image decoded, correct tab active, carousel dots follow a swipe, unknown profile → 404. Screenshots reviewed.
- **Delete propagation (human + me):** the human deleted the 3 "Phase 2 test: shakshuka" cooks on pdsls.dev. `getRecord` → RecordNotFound for all three; rows gone from Postgres (only the webhook deletes cooks); the proxy now 404s their photo CIDs while the kept cooks' photos still serve 200.
- **Human, iPhone (installed app):** Global and Profile tabs work; carousel swipes only the photos (after the overflow fix below).
- Not done: second-account test (the human has no second account).

### Known issues

- **Carousel on iPhone (human report):** swiping a photo panned the whole screen sideways and left it offset. Not reproducible in desktop WebKit/Chromium (document measured exactly viewport width). Fix applied: `overflow-x: clip` on html/body (`app/globals.css`); verified in WebKit + Chromium that a forced overflow can't pan the page, sticky header and carousel still work. **Human confirmed on iPhone: fixed** (only the carousel moves). Root cause on-device still unidentified.
- Second-account test skipped: the human has no second account. Tap delivery is verified for the human's own account (backlog drain + full rebuild), and multi-account indexing is covered by tests.
- Tap retried the 404ing webhook in a tight loop (~28k retries, 11 MB log) before the route existed. Watch for this in production if the app is down: Tap's retry has no visible backoff.
- Carried: quick-tunnel URL changes; `auth_state` never pruned; Lexicon `mealType` minLength decision still open.

### Next step

Human reviews the Phase 3 checkpoint; then commit/PR. Then Phase 4: follows, following feed, Bluesky import, first-login flow.

---

## Phase 2 — Log a cook ✅ complete (merged, PR #3)

Branch: `feature/phase-2-log-cook`

### Built

- `lib/image/process.ts` (browser): decode via `<img>` (applies EXIF orientation), canvas at ≤2000px long edge, JPEG q0.85→0.65 then shrink ×0.75 until < 1,000,000 bytes. The canvas re-encode drops the camera's EXIF, including GPS. No imports, so the e2e test can inject it into a blank page.
- `lib/image/stripJpeg.ts` (server): lossless JPEG metadata removal by walking the marker segments. Drops APP1 (EXIF/XMP), APP13 (IPTC), other APPn and COM; keeps APP0 (JFIF), APP2 (ICC, e.g. Display P3) and APP14 (Adobe).
- `lib/image/verify.ts` (server, sharp): real format must be JPEG/WebP and ≤1,000,000 bytes. JPEGs are stripped, then must show no EXIF/XMP/IPTC; WebP carrying metadata is rejected (our client only sends JPEG). Returns the cleaned bytes and measured width/height.
- `POST /api/blob`: raw image body → verify/strip → `uploadBlob` → `{ blob (JSON, $link), width, height }`. One photo per request.
- `POST /api/cook`: mealType must be one of the 7 known values. Builds the record server-side (trims, sets `createdAt`), runs `cook.$parse` before touching the PDS, then `create` with a **client-generated TID rkey**. If create throws, it does a `get` at that rkey; if the record exists, an earlier attempt landed (lost response) and it's returned instead of duplicated. Then the read-your-own-writes upsert (a failure there is logged, not surfaced: the post is on the PDS and Tap will index it).
- `lib/indexer/cook.ts`: `cookRow` (record → row: images jsonb, `cookedLocalDate` = date part of `cookedAt`, `sortAt = min(createdAt, indexedAt)`) and `upsertCook` (no-op for the same cid; a new cid updates content but keeps `indexedAt`/`sortAt`). **The Phase 3 webhook should reuse both.**
- `lib/cook/datetime.ts`: `cookedAt` with the offset *of the cooked date* (DST-correct), plus datetime-local helpers. `lib/cook/mealTypes.ts`: labels, unknown → "Other".
- `/log` page + `components/LogCookForm.tsx`: photo picker first (`accept="image/*" multiple`, max 4, previews, remove), dish, meal chips, note, cooked-at (defaults to the phone's "now", set on mount so it's never the server's zone). XHR upload with progress in the button. On failure the form stays filled and the button becomes Retry, reusing uploaded blobs (<10 min old) and the same rkey.
- `/following` placeholder: "Log a cook" button + `components/MyCooks.tsx` (last 20 own cooks from the index; thumbnail straight from the PDS `getBlob` until the Phase 3 proxy; "View record" → pdsls.dev).
- Tests: `lib/cook/datetime.test.ts`, `lib/indexer/cook.test.ts`, `lib/image/verify.test.ts` (including the exact EXIF block iOS Safari wrote on a real upload, GPS, XMP, ICC kept, pixels unchanged), `e2e/image-pipeline.spec.ts` (4032×3024 JPEG with Orientation 6 + GPS → 1500×2000 upright, no EXIF; incompressible noise → < 1 MB, aspect kept).

### Decisions not in the spec

- Upload goes browser → our server → PDS (the OAuth session and DPoP key live server-side, as in Statusphere). One request per photo keeps each one short for a PWA that may be suspended.
- A client-generated TID rkey is the idempotency key for retries.
- **The server strips JPEG metadata itself.** First version rejected any EXIF, but iOS Safari's canvas encoder adds its own 60-byte EXIF block (ColorSpace, PixelX/YDimension only; decoded from a real upload), so every iPhone upload failed. Now it strips losslessly and re-checks.
- aspectRatio comes from sharp's measurement of the uploaded bytes.
- JPEG only from the client (Safari's canvas WebP support is unreliable); WebP is still accepted by the server and Lexicon.
- `/api/cook` only writes the 7 known mealTypes. **Lexicon gap to review:** `mealType` has no `minLength`, so `""` is a valid record. Other clients' `""` will display as "Other". Adding `minLength: 1` before the real namespace is published is cheap; after, it's permanent.
- Form state is in memory only. If iOS kills the suspended app, the draft is lost (retry covers failed requests, not process death). IndexedDB drafts would be extra scope.
- "My cooks" lives on the `/following` placeholder instead of a new route.

### Verified (and how)

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm test`: 61/61. `pnpm test:e2e`: 8/8.
- curl, signed out: `/log` → 307 to `/`; `/api/blob` and `/api/cook` → 401.
- API script through the running server as the human (cookie minted for their DID with approval), 45/45: PNG/oversize rejected; GPS-tagged JPEG accepted and **stored without EXIF (getBlob)**; invalid rkey/dish/0 or 5 images/no offset/empty or unknown mealType → 400; create → 200; **retry with the same rkey → same uri+cid, one row**; `getRecord` checked field by field; Postgres row checked (cookedAtUtc, cookedLocalDate across UTC midnight, images jsonb, sortAt).
- Playwright, `/log` at 375px light+dark, browser in `Asia/Kolkata`: previews upright, submit disabled until complete, default time = browser local time, no hydration errors, no horizontal scroll.
- **Human, installed PWA on iPhone via tunnel:**
  - "BLT": 1 photo, backdated `cookedAt` `2026-09-28T12:34:00-04:00`.
  - "Bleeg": 3 photos (landscape 2000×1500, portrait 1500×2000, screenshot 923×2000).
  - For both, `getRecord` fields are correct and every stored blob is JPEG with no EXIF/XMP/IPTC and no "GPS/Apple/iPhone" strings. The portrait photo was viewed and is upright. Postgres rows match.
- Not verified: arrival through Tap (the webhook is Phase 3). HEIC can't be confirmed server-side: iOS hands the page a JPEG either way, and the posts decoded fine.

### Known issues

- One unexplained "Network error while uploading" on the human's first attempt (the request never reached the server; possibly the tunnel just after restart). Not reproduced since.
- 3 test cooks ("Phase 2 test: shakshuka", rkeys `3mwovhkvtw723`, `3mwovhkvtw223`, `3mwovihdbi22x`) are still on the human's PDS and in the index. Delete them with the Phase 5 delete route. (Standalone scripts can't load the OAuth client: `.ts` imports go through CJS and hit ESM-only `multiformats`.)
- Quick tunnels die when the laptop sleeps. A new URL means a new client_id: sign in again and re-install the PWA. On the Mac, curl may cache "host not found" for a new tunnel host for a while (use `--resolve`); phones are unaffected.
- `lib/image/process.ts` has no imports by design (the e2e test depends on it).
- Carried: Tap webhook 404s until Phase 3; `auth_state` never pruned.

### Next step

Human reviews the Phase 2 checkpoint (and decides on the `mealType` `minLength` Lexicon tweak). Then Phase 3: Tap webhook (reuse `cookRow`/`upsertCook`), identity handling, image proxy, global feed, profiles, cook detail, idempotency test, index rebuild procedure.

---

## Phase 1 — Lexicons and schema ✅ complete (merged, PR #2)

Branch: `feature/phase-1-lexicons`

### Built

- `lexicons/com/example/cooklog/{cook,kudos,comment,follow}.json` per §4, all `tid` keys.
- `lexicons/com/atproto/repo/strongRef.json` via `lex install` (pinned by CID in `lexicons.json`).
- `pnpm lex:build` → `lib/lexicons-gen/` (committed; eslint-ignored). `lib/lexicons.ts` is the single re-export (`cook`, `kudos`, `comment`, `follow`, `strongRef`).
- Migration `002_index`: `account`, `cook`, `kudos`, `comment`, `follow` (timestamptz throughout, no FKs), with indexes for feed cursors, profile feeds, stats, kudos/comment lookups.
- Kysely types in `lib/db/schema.ts`; `date` columns parsed as `'YYYY-MM-DD'` strings (`lib/db/index.ts`).
- `lib/lexicons.test.ts`: 29 tests. Valid records and every §4 limit, through `jsonToLex` → `$parse`, as the webhook will do it.

### Decisions not in the spec

- Byte caps alongside grapheme caps (Bluesky convention, 10×): dishName 1000 B, note 10000 B, alt 3000 B, comment 5000 B. A string of 100 ZWJ family emoji (18 B each) would be rejected; normal emoji are fine.
- `mealType` has `maxLength: 64` so unknown values can't be huge; unknown values are still accepted.
- `aspectRatio` is its own `#aspectRatio` def with `minimum: 1` on both ints.
- Generated code is committed (Statusphere gitignores it and builds on `dev`/`build`); committing it means `typecheck`/`test` work on a fresh clone without an extra step. Regeneration verified reproducible (no diff).
- No foreign keys: Tap can deliver kudos before its cook, or records before identity.
- Added `comment_author_idx` (account purge) and `kudos_subject_idx` (counts).
- `pending_login` not created (Phase 0 proved the claim flow unnecessary).

### Verified (and how)

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm test`: 35/35.
- `pnpm migrate` applied `002_index`; `\d` of every table checked. `migrateDown` then `migrate` round-trips cleanly.
- Kysely round trip under `TZ=America/Los_Angeles` in a rolled-back transaction: `cookedLocalDate` returns `2026-09-29` unchanged, `images` jsonb returns the array.
- Not applicable this phase: PDS writes, Tap delivery, UI.

### Known issues

- Namespace rename also means moving `lexicons/com/example/cooklog/` and editing the `id`s in the JSON, not only `lib/lexicons.ts` + `lib/config.ts`.
- Carried from Phase 0: Tap webhook 404s until Phase 3; quick-tunnel URL changes per run; `auth_state` never pruned.

### Next step

Human reviews the Lexicon JSON (records are permanent once written). After sign-off: Phase 2, log a cook (§6.5 client image pipeline, `uploadBlob`, `createRecord`, read-your-own-writes upsert into `cook`, retry, bare "my cooks" list).

---

## Phase 0 — Setup, login and install ✅ complete (2026-09-29)
Branch: `feature/initial-app-build`

### Built

- Next.js 16.3 (App Router, TS strict, Tailwind 4) scaffold, Node 22 pinned (`.nvmrc`, `engines`).
- `lib/config.ts`: `NS = com.example.cooklog`, `APP_NAME = Cooklog`, granular `SCOPE`, theme colors.
- Postgres 17 via `docker-compose.yml`; Kysely + `pg`; migration `001_auth` (`auth_state`, `auth_session`, timestamptz).
- OAuth (per the Statusphere example): loopback client when `PUBLIC_URL` is empty, confidential client (`private_key_jwt`, ES256) when set. Routes: `/oauth/login`, `/oauth/callback`, `/oauth/logout`, `/oauth-client-metadata.json`, `/.well-known/jwks.json`.
- HMAC-signed session cookie, 180 days (`lib/auth/cookie.ts`).
- Callback registers the DID with Tap (`addRepos`); failure is logged and doesn't block sign-in.
- Tap installed (`go install`), `scripts/tap.sh` with signal collection, filters, admin password and webhook URL.
- PWA: `app/manifest.ts` (standalone, start_url `/following`, scope `/`), placeholder icons 192/512/maskable-512, `apple-icon.png` (180), `viewport-fit=cover`, safe-area utilities on the body, `appleWebApp` meta.
- Pages: `/` sign-in (redirects to `/following` when signed in); `/following` placeholder showing handle + DID + sign out.
- Vitest (session-cookie tests), Playwright at 375px (`e2e/phase0.spec.ts`).
- README, CLAUDE.md (§0 verbatim + commands), `.env.example`.

### Verified (and how)

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm test`: 6/6. `pnpm test:e2e`: 5/5 (screenshot reviewed).
- Migrations applied; `\d` shows timestamptz columns.
- curl: `/oauth/login` returns 400 for missing/unknown handles; for a real handle bsky.social accepts the authorization request with our granular scopes (loopback mode and tunnel mode).
- Tunnel mode: bsky.social fetched client metadata over the cloudflared tunnel and accepted the private_key_jwt request; JWKS serves only the public key.
- Forged bare-DID cookie is rejected (redirected to sign-in).
- Tap: connects to relay, enumerates signal collection, `/health` 401 without password and 200 with it.

### Verified by the human (2026-09-29)

- [x] Desktop sign-in via the tunnel: `/following` shows the handle. Server side confirmed: callback 307, `auth_session` row for the DID, Tap resynced the repo after `/repos/add`.
- [x] Real iPhone, installed to home screen: signed out inside the installed app, signed in again from inside it, and the OAuth redirect returned to the installed app (not Safari). **The §7.1 claim flow is not needed**; `pending_login` table is not created.
- [ ] Not explicitly reported: desktop sign-out, and icon/status bar/safe-area appearance on the device. Re-check during the Phase 6 device walkthrough.

Note for later: iOS copies Safari cookies into a home-screen app at install time, so "signed in after installing" doesn't prove the OAuth redirect works. The test that counts is signing in from inside the installed app.

### Known issues

- Tap delivers to `/api/webhook`, which doesn't exist until Phase 3, so deliveries 404 and Tap retries. Harmless locally.
- Quick-tunnel URL changes each run; `PUBLIC_URL` must be updated and dev restarted.
- `auth_state` rows for abandoned logins are never pruned (tiny; could add cleanup later).
- Browser extensions can add attributes to `<body>`; `suppressHydrationWarning` on `<body>` only (app/layout.tsx) silences that dev warning.
