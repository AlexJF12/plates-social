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

Until Phase 3 adds `/api/webhook`, Tap's deliveries get a 404 and it keeps retrying. That's expected.

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

## Lexicons

Record schemas live in `lexicons/com/example/cooklog/*.json`. `com.atproto.repo.strongRef` was fetched with `lex install` and is pinned by CID in `lexicons.json`. After editing any Lexicon JSON, regenerate the TypeScript and commit it:

```sh
pnpm lex:build    # writes lib/lexicons-gen/ (generated; never edit by hand)
```

App code imports Lexicons only through `lib/lexicons.ts`.

## Tests

```sh
pnpm typecheck
pnpm lint
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright at 375px; needs pnpm dev running. Screenshots in test-results/
```

## Resetting local data

```sh
pnpm db:down && docker volume rm plates-social_pgdata && pnpm db:up && pnpm migrate
rm -rf .tap-data
```
