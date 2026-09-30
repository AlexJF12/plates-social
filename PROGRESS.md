# Progress

## Current phase: 2 — Log a cook ⏸ checkpoint, awaiting review (2026-09-29)

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
