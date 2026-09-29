# Progress

## Current phase: 1 — Lexicons and schema ⏸ checkpoint, awaiting Lexicon review (2026-09-29)

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
