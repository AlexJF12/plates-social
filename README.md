# plates-social (working name: Cooklog)

A Strava for home cooking on the AT Protocol, delivered as an installable PWA. See `SPEC.md` for the brief and `PROGRESS.md` for status.

## Prerequisites

- Node 22 (`nvm install 22 && nvm use`; Node 24 currently breaks Next.js)
- pnpm (`corepack enable`)
- Docker Desktop (local Postgres)
- Go (to install Tap)
- cloudflared, for phone testing (`brew install cloudflared`)

## First-time setup

```sh
pnpm install
cp .env.example .env.local
# Fill SESSION_SECRET (openssl rand -hex 32) and TAP_ADMIN_PASSWORD (openssl rand -hex 16)
pnpm db:up        # Postgres 17 in Docker on 127.0.0.1:5432
pnpm migrate
go install github.com/bluesky-social/indigo/cmd/tap@latest
```

## Running locally

Three processes, each in its own terminal:

```sh
pnpm dev          # Next.js on http://127.0.0.1:3000
pnpm tap          # Tap on 127.0.0.1:2480, webhook -> http://127.0.0.1:3000/api/webhook
```

Open **http://127.0.0.1:3000** (not `localhost`) and sign in with your Bluesky handle.

In this mode the app is an atproto *loopback* OAuth client: no keys and no hosted metadata, but the PDS can only redirect back to `127.0.0.1`, so it only works on this computer.

### Tap

`scripts/tap.sh` runs Tap with:

- `--signal-collection=<NS>.cook` — auto-discover every account that has posted a cook
- `--collection-filters=<NS>.*,app.bsky.actor.profile` — only deliver our records and profiles
- `--admin-password` — required on every Tap request, and on Tap's webhook calls to us
- SQLite state in `.tap-data/` (delete it to make Tap forget everything)

Signing in also registers your DID with Tap (`/repos/add`) so accounts without cooks are tracked too. Check it with:

```sh
source .env.local
curl -u admin:$TAP_ADMIN_PASSWORD http://127.0.0.1:2480/info/<your-did>
```

Tap delivers every event to `POST /api/webhook` (Basic auth with the same password). A 200 is the ack; anything else makes Tap retry. Rejected records (bad Lexicon, broken rule) still get a 200 and a `webhook: dropped …` log line, so they aren't retried forever. The dev server must be running for events to arrive; Tap buffers them until it is.

Other useful Tap endpoints (all need `-u admin:$TAP_ADMIN_PASSWORD`; POSTs also need `-H 'Content-Type: application/json'`, or Tap silently reads an empty DID list):

```sh
curl -u admin:$TAP_ADMIN_PASSWORD http://127.0.0.1:2480/stats/outbox-buffer   # events waiting for the webhook
curl -u admin:$TAP_ADMIN_PASSWORD http://127.0.0.1:2480/stats/repo-count
```

## Testing on a phone (tunnel)

Phones can't reach the loopback redirect, so over a tunnel the app switches to a *confidential* OAuth client: the PDS fetches our metadata from `PUBLIC_URL/oauth-client-metadata.json` and we sign requests with `PRIVATE_KEY`.

```sh
cloudflared tunnel --url http://127.0.0.1:3000     # prints https://<random>.trycloudflare.com
pnpm gen-key                                       # once; paste the output into PRIVATE_KEY
# set PUBLIC_URL=https://<random>.trycloudflare.com in .env.local, then restart pnpm dev
```

Quick-tunnel URLs change on every run. After restarting cloudflared, update `PUBLIC_URL` and restart `pnpm dev`. Sessions created under an old URL belong to a different client, so sign in again.

To go back to plain localhost dev, empty `PUBLIC_URL` and restart.

**Install on iPhone:** open the tunnel URL in Safari → Share → Add to Home Screen → open from the home screen → sign in.

## PWA: offline page and install hint

`public/sw.js` is deliberately minimal: it caches one response, `/offline` (a self-contained page, `app/offline/route.ts`), and shows it when a page navigation fails. It never caches feeds, API responses, images or anything auth-related, and it leaves `/oauth/*` entirely alone. After changing `/offline`, bump `CACHE` in `sw.js` so installed apps fetch the new one. To clear it in a browser: DevTools → Application → Service workers → Unregister.

The install hint (`components/InstallHint.tsx`) shows once, until dismissed, and never in the installed app: instructions in iOS Safari, an Install button when Android Chrome fires `beforeinstallprompt`. To see it again, clear `installHintDismissed` from localStorage.

## Hiding an account (denylist)

Set `DENYLIST_DIDS` (DIDs separated by commas or spaces) and restart the app; on Fly, `fly secrets set` does the restart, so no code deploy is needed. It's applied when reading (feeds, profiles, cook pages, kudos, comments, counts, stats, import, image proxy) next to the inactive-account check. Nothing is deleted from the index, so removing a DID brings its content straight back.

## Lexicons

Record schemas live in `lexicons/com/example/cooklog/*.json`. `com.atproto.repo.strongRef` was fetched with `lex install` and is pinned by CID in `lexicons.json`. After editing any Lexicon JSON, regenerate the TypeScript and commit it:

```sh
pnpm lex:build    # writes lib/lexicons-gen/ (generated; never edit by hand)
```

App code imports Lexicons only through `lib/lexicons.ts`.

## Images

`/api/img/<did>/<cid>?size=avatar|thumb|full` serves photos and avatars: it only serves CIDs referenced by an indexed cook or profile from a visible account (active, not denylisted), fetches the blob from the author's PDS (https only), checks the bytes against the CID, resizes to WebP with sharp and caches it on disk in `.cache/img/` (override with `IMAGE_CACHE_DIR`). Delete that folder any time; it refills on demand.

## Tests

```sh
pnpm typecheck
pnpm lint
pnpm test         # Vitest; the indexer/query tests need Postgres up (they run in rolled-back transactions)
pnpm test:e2e     # Playwright at 375px; needs pnpm dev running. Screenshots in test-results/
```

## Resetting local data

```sh
pnpm db:down && docker volume rm plates-social_pgdata && pnpm db:up && pnpm migrate
rm -rf .tap-data
```

## Rebuilding the index

Everything in Postgres except `auth_state`/`auth_session` is a copy of records on users' PDSes, so the index can always be rebuilt from Tap. Use this if index data is ever corrupted.

```sh
# 1. The app (pnpm dev, or the production app) and Tap must both be running:
#    the rebuild arrives through the normal webhook.
# 2. Dry run: shows the database, row counts and the repos it will re-sync.
pnpm rebuild-index
# 3. Do it. Wipes account/cook/kudos/comment/follow, then removes and re-adds
#    every repo in Tap, which makes Tap backfill each one from its PDS.
#    Waits until Tap's outbox is empty and prints row counts before/after.
pnpm rebuild-index --yes
```

- The repos to re-sync are collected from the index tables and `auth_session` before the wipe (Tap has no "list repos" endpoint). If you know of accounts missing from the index, pass their DIDs as extra arguments.
- Feeds are empty until the backfill lands (seconds locally; longer with many repos).
- `indexedAt` is reset to the rebuild time. `sortAt` is unchanged for normal records (it's `min(createdAt, indexedAt)`); only future-dated records get re-stamped.
- If Tap's own state is lost or suspect too: stop Tap, `rm -rf .tap-data`, start it again (it re-discovers every account with a cook via the signal collection), then run `pnpm rebuild-index --yes` so signed-in users without cooks are re-added.
- **Production:** never run this without the human approving the exact command, and take a Neon branch/restore point first (§0.13).

Verified 2026-09-29 locally: a dump of every index column except `indexedAt`/`updatedAt` was byte-identical before and after.
