@AGENTS.md

# Cooklog — working notes for Claude

Full brief: `SPEC.md`. Current status and next step: `PROGRESS.md` (read it first).

## Commands

Node 22 is required (`nvm use` picks it up from `.nvmrc`; Node 24 breaks Next.js). pnpm via corepack. In a non-interactive shell (Claude's Bash tool), `pnpm` isn't on PATH until you run `source ~/.nvm/nvm.sh && nvm use`.

| What | Command |
|---|---|
| Install | `pnpm install` |
| Postgres (Docker) up / down | `pnpm db:up` / `pnpm db:down` |
| Migrations | `pnpm migrate` |
| Rebuild the index from Tap (dry run without `--yes`; see README) | `pnpm rebuild-index --yes` |
| Regenerate Lexicon code (after editing `lexicons/`) | `pnpm lex:build` |
| Dev server (http://127.0.0.1:3000) | `pnpm dev` |
| Tap (needs `go install github.com/bluesky-social/indigo/cmd/tap@latest`) | `pnpm tap` |
| HTTPS tunnel for phone testing | `cloudflared tunnel --url http://127.0.0.1:3000` (then set `PUBLIC_URL`, restart dev) |
| Typecheck / lint | `pnpm typecheck` / `pnpm lint` |
| Unit tests (Vitest) | `pnpm test` |
| UI tests at 375px (Playwright; dev server must be running) | `pnpm test:e2e` |
| OAuth signing key (confidential-client mode) | `pnpm gen-key` |
| Placeholder icons | `pnpm gen-icons` |

Always use `127.0.0.1`, not `localhost`: the loopback OAuth redirect is pinned to it and the session cookie is host-scoped.

## Conventions learned so far

- `lib/config.ts` holds `NS`, `APP_NAME`, `SCOPE`, `THEME`. Never hard-code the namespace elsewhere.
- Session cookie is `<did>.<hmac>` (`lib/auth/cookie.ts`), never a bare DID.
- `pnpm dev` binds to 127.0.0.1; `pnpm` 12 has no `-s` flag.
- Scripts that import `@atproto/oauth-client-node` must be `.mts` (it pulls ESM-only `multiformats`).
- pnpm 12 blocks unapproved install scripts; decisions live in `pnpm-workspace.yaml` `allowBuilds`.
- Generated Lexicon code is committed in `lib/lexicons-gen/`; import it only via `lib/lexicons.ts`. Tap records are JSON, so run `jsonToLex` before `$parse` (see `lib/lexicons.test.ts`).
- `cook.images` is jsonb: insert `JSON.stringify(images)` (pg would send a JS array as a Postgres array). `date` columns come back as `'YYYY-MM-DD'` strings (type parser in `lib/db/index.ts`).
- Throwaway scripts with top-level await must be `.mts`.
- A standalone script can't import `lib/auth/client.ts` (tsx loads the `.ts` as CJS → ESM-only `multiformats` error). Do OAuth-session actions through a route on the dev server.
- iOS Safari's canvas JPEG encoder writes its own small EXIF block. Never reject "any EXIF" — `lib/image/verify.ts` strips JPEG metadata losslessly instead.
- Next renders an empty `role="alert"` (route announcer): in Playwright, scope alert lookups to the form.
- Quick tunnels die when the laptop sleeps; a new URL = new client_id = sign in again + re-install the PWA.
- Webhook indexing lives in `lib/indexer/` (`indexEvent`). Every write there is an idempotent single statement (no transactions), so tests can wrap it in `inRollback` (`lib/db/testing.ts`) against the real local Postgres.
- Feeds inner-join `account` and require `active`: any path that indexes content must `ensureAccount` first.
- Tap admin POSTs need `Content-Type: application/json`, or Tap binds an empty DID list (remove "succeeds" with count 0; add returns 500 "empty slice").
- In zsh, `curl $A` with `A="-u x:y"` passes one argument; inline `-u admin:$TAP_ADMIN_PASSWORD`.
- Playwright on signed-in pages: the human approved minting a session cookie for their DID (HMAC with `SESSION_SECRET`), injected in the test context only, never committed.

---

## 0. Ground rules (read first, follow throughout)

1. **Work in phases (§8). Stop at every checkpoint.** At the end of each phase, report: what you built, which files changed, any decision you made that this spec didn't specify, the exact manual steps to verify it, and test/typecheck results. Then wait for the human to say continue. Do not start the next phase early.
2. **Reference implementations are the source of truth for library APIs.** Read these before writing code and follow their patterns:
   - Tutorial: https://atproto.com/guides/statusphere-tutorial
   - Its code: https://github.com/bluesky-social/statusphere-example-app
   - The OAuth tutorial it builds on: https://atproto.com/guides/oauth-tutorial
   - Permissions: https://atproto.com/guides/permission-requests
   - Tap: https://atproto.com/blog/introducing-tap

   atproto libraries move fast. If this spec's description of a library API conflicts with current docs or source, follow the docs and tell the human.
3. **Namespace placeholder.** There is no app name or domain yet. All Lexicon IDs use the namespace `com.example.cooklog`, stored in **one** config constant (`NS`). The app display name is also one constant (`APP_NAME = "Cooklog"`). Generated Lexicon code must be imported through a single re-export module (e.g. `lib/lexicons.ts`), so a later rename means regenerating code and editing one file. **Never deploy or publish Lexicons while `NS` starts with `com.example`.** The real namespace is permanent: it gets stamped into every record every user writes.
4. **Scope discipline.** Build exactly what §2 lists. Do not add features from §2.2, and do not scaffold for them.
5. **Least privilege.** Request only the granular OAuth scopes in §5. Never request `transition:generic`. Never write to any `app.bsky.*` collection.
6. **Treat network records as untrusted input.** Anyone can write any record to their own repo. Validate every indexed record against its Lexicon and enforce every limit in this spec at index time, not only in the UI.

### Working rules

7. **Make these rules persistent.** In Phase 0, create `CLAUDE.md` containing this whole §0 plus the commands to run the app, Postgres, Tap and the tests. Create `PROGRESS.md` as well. Keep both current.
8. **One phase per session, with a written handoff.** At every checkpoint, update `PROGRESS.md`: what's built, what's verified and how, known issues, and the next step. The human will usually start a fresh session for the next phase, and `PROGRESS.md` plus `CLAUDE.md` must be enough to pick up cleanly. If a session is getting long mid-phase, stop at a stable point and write the handoff instead of pushing on.
9. **Done means verified end to end, not "it returned 200."** For every feature:
   - exercise the API route directly (curl or a test) before building UI on it;
   - confirm every UI call targets a route that actually exists, and every form field arrives at the server;
   - for writes, read the record back from the PDS with `com.atproto.repo.getRecord` and check every field;
   - confirm it arrives in Postgres through Tap, not only through the read-your-own-writes upsert.

   In each checkpoint report, say which of these checks you actually ran. Never say something works because you reasoned that it should.
10. **Two attempts, then stop.** If an approach fails twice, stop. Explain what you've learned, what you now suspect, and the options, then wait before trying a third. If the human says a layer is working, stop investigating that layer.
11. **Confirm you're testing the new code.** Before concluding that a fix didn't work, confirm the running processes (dev server, Tap, tunnel) actually include the change and use the expected config and flags.
12. **No drive-by changes.** Change only what the current task needs. Don't touch config, deploy settings, health checks or dependencies unrelated to it. If you think something else should change, list it in the checkpoint report instead.
13. **Production data is sacred.**
    - Never run a migration, script or data fix against production without the human approving that specific command.
    - Migrations are additive: add new columns or tables, backfill them, and remove old ones in a later release. Never change a column's type in place.
    - Use `timestamptz` for every timestamp from the first migration.
    - Before any production migration, create a Neon branch or restore point and state the rollback steps.
14. **The index must stay rebuildable.** Everything in Postgres except auth sessions is a copy of records on users' PDSes. Keep it that way: never store user content only in Postgres. In Phase 3, write and test a documented procedure that wipes the index tables and rebuilds them from Tap. That is the recovery plan if index data is ever corrupted.
15. **Give yourself a feedback loop for UI.** For visual or interactive work, use Playwright to load pages at 375px width, take screenshots and check them instead of guessing. Where a page needs a signed-in session, ask the human how to handle it rather than adding an auth bypass. Real-phone testing by the human is still required where §8 says so.

