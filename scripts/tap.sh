#!/usr/bin/env bash
# Runs Tap locally against the live network, delivering to the dev server's webhook.
# Install once: go install github.com/bluesky-social/indigo/cmd/tap@latest
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then set -a; source .env.local; set +a; fi
: "${TAP_ADMIN_PASSWORD:?Set TAP_ADMIN_PASSWORD in .env.local}"

TAP_BIN="$(command -v tap || echo "$(go env GOPATH)/bin/tap")"
NS="$(sed -n 's/^export const NS = "\(.*\)";$/\1/p' lib/config.ts)"
mkdir -p .tap-data

# Signal collection: auto-discover any account that has posted a cook.
# Collection filters: only deliver our records plus profiles (§6.1).
exec "$TAP_BIN" run \
  --db-url="sqlite://./.tap-data/tap.db" \
  --bind="127.0.0.1:2480" \
  --webhook-url="${TAP_WEBHOOK_URL:-http://127.0.0.1:3000/api/webhook}" \
  --signal-collection="$NS.cook" \
  --collection-filters="$NS.*,app.bsky.actor.profile" \
  --admin-password="$TAP_ADMIN_PASSWORD" \
  "$@"
