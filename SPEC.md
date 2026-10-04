# Build brief: a Strava for home cooking on the AT Protocol

You are building v1 of a social web app where the unit of content is **a meal someone actually cooked**. You cook, snap photos, log it, and the people who follow you see it in a feed and give kudos. It is a log of cooking that happened, not a recipe library.

The app runs on the AT Protocol (atproto), the protocol behind Bluesky. Users sign in with their existing Bluesky/atproto account. Every cook, kudos, comment and follow is a record written to **the user's own repository on their own PDS**. This app never owns user data. It owns an *index* of it, built by syncing records from the network.

It ships as a **progressive web app**: a website people add to their phone's home screen, where it opens full-screen like a native app. There is no app store distribution.

The human you are working with reads and reviews code comfortably. Keep explanations brief. Explain atproto-specific and PWA-specific choices when you make them, because those are the unfamiliar parts.

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
5. **Least privilege.** Request only the granular OAuth scopes in §5. Never request `transition:generic`. Never write to any `app.bsky.*` collection, with one exception approved by the human: creating an `app.bsky.feed.post` when the user taps "Post to Bluesky" on their own cook (§2.1, create only, never edit or delete).
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

---

## 1. Stack

| Concern | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript (strict), following the Statusphere tutorial |
| Delivery | Progressive web app (manifest + minimal service worker), installed from the browser (§7.1) |
| Styling | Tailwind CSS |
| atproto | `@atproto/oauth-client-node` (per OAuth tutorial), `@atproto/lex` (Lexicons + codegen + client), `@atproto/syntax`, `@atproto/common-web`, `@atproto/tap` |
| Sync | **Tap** (Go binary from `bluesky-social/indigo`), delivering to a webhook |
| Database | Postgres via Kysely with migrations. Local: Docker. Production: Neon. |
| Images | `sharp` on the server for resizing in the image proxy |
| Tests | Vitest |
| Runtime | Node 22.x (the tutorial notes Node 24 currently breaks Next.js), pnpm |
| Hosting | Fly.io: one machine for the Next.js app, one for Tap (SQLite state on a Fly volume) |

---

## 2. Product scope

### 2.1 In scope for v1

- **Installable as a PWA.** No app stores. People add it to their phone's home screen from Safari (iOS) or Chrome (Android), and it opens full-screen like a native app. See §7.1.
- **Sign in** with an existing atproto account (handle input → OAuth), including from the installed home-screen app. The handle field suggests accounts as you type (Bluesky's public `searchActorsTypeahead`, called from the browser); tapping one signs in.
- **Log a cook**: 1–4 photos (at least one required), dish name, meal type, optional note, and when it was cooked (defaults to now, editable).
- **Global feed**: every cook indexed from the whole network, newest first.
- **Following feed**: cooks from people you follow in this app, plus your own.
- **Profile page** per person: avatar, display name, handle, follow/unfollow button, stats (§6.4), and their cooks newest first.
- **Cook detail page**: all photos, full note, kudos, comments.
- **Follows** that belong to this app (not inherited from Bluesky), plus a **one-tap import** of Bluesky follows who have posted cooks here (§6.3).
- **Kudos** (toggle on/off) and **comments** (flat, no threading).
- **Delete**: you can delete your own cooks and your own comments. No editing.
- **Stats**: number of cooks this week and this month.
- **Best cook** (Phase 6.6): per calendar month (the author's local month) and known meal type, the cook with the most distinct kudos authors (not self, visible accounts only; ≥ 1 to win; ties by earliest `cookedAt`, then lowest `uri`). Computed from the index on read, never stored. A Best tab per month (`/best/YYYY-MM`), a badge on winning cooks for completed months, and a "Best cooks" row on profiles.
- **Search** (Phase 6.6, `/search?q=&meal=`): dish names (case- and accent-insensitive substring) with a meal-type filter, plus people by display name or handle.
- **Sharing** (human-requested): a Share button on the cook detail page opens a sheet with
  - **Post to Bluesky** (author only): one `app.bsky.feed.post` in the author's repo with the dish name, note (cut with "…" to fit 300 graphemes), a link facet to the cook page, and the cook's photos as an `app.bsky.embed.images` embed reusing the blobs already in the repo (no re-upload). The rkey is a client TID reused on retry. Not indexed.
  - **Share…**: the native iOS/Android share sheet (`navigator.share`) with the photos as JPEG files and the text "dish, note, link"; without Web Share, an `sms:` link with the text only. Plus **Copy link**.
- **Public cook page**: `/cook/[did]/[rkey]` is viewable signed out (photos, dish, note, author, counts; no kudos list, comments or profile links), with Open Graph/Twitter tags for link previews, `noindex`, and "Sign in" that returns to the cook (`?next=`, carried through the OAuth `state`).

### 2.2 Explicitly out of scope

Editing cooks, streaks, heatmaps, any other stats, recipes, ingredients, tags, cooking time, automatic cross-posting to Bluesky (only the explicit "Post to Bluesky" in §2.1), notifications (including web push), search beyond dish names and people (notes, comments, full-text ranking), DMs, video, native mobile apps or app store builds, offline posting, moderation tooling beyond the denylist in §7.

---

## 3. Architecture

```
 Phone (installed PWA or browser)
     │ cookie session
     ▼
 Next.js app (Fly machine 1)
   • OAuth client, sessions
   • write path  ──────────────► user's PDS (createRecord / uploadBlob / applyWrites / deleteRecord)
   • read pages  ◄── Postgres
   • /api/webhook ◄── Tap
   • /api/img/... image proxy ──► author's PDS (getBlob), disk cache
     ▲
     │ webhook (at-least-once)
 Tap (Fly machine 2)  ◄── relay firehose + PDS backfill
```

Mental model: users write to their own PDS. Tap watches the network, verifies records, and posts them to our webhook. The webhook upserts them into Postgres. Pages read from Postgres only.

**Read-your-own-writes:** after a successful write, immediately upsert the same record into Postgres using the returned `uri` and `cid`, so the user sees their cook, kudos or comment instantly. When Tap delivers the same record later, the upsert must be a no-op. Deletes work the same way.

---

## 4. Lexicons

Write these as Lexicon JSON files under `lexicons/`, generate types with `lex build`, and validate with the generated `$parse` in the webhook. Keep the descriptions short and clear. **The human will review these at the Phase 1 checkpoint, because records written under them are permanent.** Use `tid` record keys for all four types.

### `NS.cook`
| Field | Type | Rules |
|---|---|---|
| `dishName` | string | required, 1–100 graphemes |
| `mealType` | string | required, `knownValues`: `breakfast`, `lunch`, `dinner`, `snack`, `bread`, `dessert`. Display unknown values as "Other"; don't reject them. |
| `note` | string | optional, max 1000 graphemes |
| `images` | array of `#image` | required, minLength 1, maxLength 4 |
| `cookedAt` | datetime | required. The client writes local time **with its UTC offset** (e.g. `2026-09-29T19:30:00-04:00`); §6.4 depends on this. |
| `createdAt` | datetime | required |

`#image`: `image` (blob, accept `image/jpeg`, `image/webp`, maxSize 1,000,000 bytes), `alt` (string, max 300 graphemes, optional), `aspectRatio` (`{ width, height }` integers, required).

### `NS.kudos`
`subject` (`com.atproto.repo.strongRef`, required), `createdAt` (required).

### `NS.comment`
`subject` (`com.atproto.repo.strongRef` to a cook, required), `text` (1–500 graphemes, required), `createdAt` (required).

### `NS.follow`
`subject` (DID string, required), `createdAt` (required).

Profiles are **not** a custom Lexicon. Display names and avatars come from the user's existing `app.bsky.actor.profile` record, read-only.

---

## 5. Auth

- Follow the OAuth tutorial's session and client setup. For local development, use the loopback (localhost) client pattern it uses. No domain is needed yet.
- Scopes: `atproto repo:NS.cook repo:NS.kudos repo:NS.comment repo:NS.follow repo:app.bsky.feed.post?action=create blob:image/*`, with `NS` expanded. Sessions from before the feed.post scope was added lack it: "Post to Bluesky" checks the token's scope and asks the user to sign in again (same account) to grant it.
- Before launch (Phase 7, once there's a real domain), replace the individual `repo:` scopes with a published **permission set** for the namespace so users see a readable consent screen. Don't do this before then.
- On every successful login, register the user's DID with Tap (`POST /repos/add`). This is required: see §6.1.
- Sign-in must work from the installed home-screen app, not just the browser. See the OAuth item in §7.1.

---

## 6. Behaviour

### 6.1 Sync with Tap

- Tap config: `TAP_SIGNAL_COLLECTION=NS.cook`, `TAP_COLLECTION_FILTERS=NS.*,app.bsky.actor.profile`, webhook mode pointed at `/api/webhook`, admin password required (verify it with `assureAdminAuth` as in the tutorial).
- The signal collection only discovers accounts that have posted a cook. A user who has only given kudos or followed someone would be missed, which is why login also calls `/repos/add`.
- The webhook must be **idempotent**, because Tap delivery is at-least-once. Key every table by record `uri`. Handle `create`, `update` (treat as upsert, though our UI never edits) and `delete`.
- `identity` events: upsert handle and active status. Deleted accounts: purge all their rows. Inactive accounts: hide their content but keep the rows.
- Records that fail `$parse` or violate §4 limits are dropped and logged, never partially indexed.

### 6.2 Database

Use Kysely migrations. Suggested tables (adjust if you have a reason, and say why):

- `account` — `did` PK, `handle`, `displayName`, `avatarCid`, `active`, `updatedAt`
- `cook` — `uri` PK, `cid`, `authorDid`, `dishName`, `mealType`, `note`, `images` (jsonb: cid, mime, alt, aspectRatio), `cookedAt` (original string), `cookedAtUtc` (timestamptz), `cookedLocalDate` (date in the author's own offset), `createdAt`, `indexedAt`, `sortAt`
- `kudos` — `uri` PK, `authorDid`, `subjectUri`, `subjectCid`, `createdAt`; unique (`authorDid`, `subjectUri`), keeping the earliest if duplicates arrive
- `comment` — `uri` PK, `authorDid`, `subjectUri`, `text`, `createdAt`, `sortAt`
- `follow` — `uri` PK, `authorDid`, `subjectDid`, `createdAt`; unique (`authorDid`, `subjectDid`)
- `pending_login` — only if the §7.1 claim flow is needed
- plus the OAuth tutorial's auth state/session tables

`sortAt = min(createdAt, indexedAt)`, so a backdated or future-dated `createdAt` can't game feed order. Feeds and comment lists order by `sortAt`. Use cursor pagination (sortAt + uri), 20 items per page, with infinite scroll.

Kudos and comments whose subject cook is gone or hidden are not shown. Don't delete other people's rows because of that.

### 6.3 Follows and Bluesky import

- The follow button on a profile creates or deletes an `NS.follow` record.
- **Import**: page through the user's `app.bsky.graph.follow` records with the public `com.atproto.repo.listRecords` on their PDS (no auth scope needed). Intersect those DIDs with accounts that have at least one indexed cook, and drop anyone already followed in this app. Show the result as a list with avatars, all pre-selected, and a single "Follow all" button. Write the follows with `com.atproto.repo.applyWrites` in batches (≤100 writes per call).
- Show the import screen once, right after a user's first login. Also make it reachable from their own profile. If the intersection is empty, skip the screen and land on the global feed.

### 6.4 Stats

On every profile: **cooks this week** and **cooks this month**. Count cook records, where weeks start Monday and months are calendar months. Both are computed from `cookedLocalDate`, i.e. in the author's own local calendar as recorded by the offset in `cookedAt`, not the server's time zone. The "current" week and month are determined in the viewer's time zone (sent by the browser). Write unit tests for the bucketing, including offsets that cross midnight UTC.

### 6.5 Photos

- On the client, before upload: downscale to max 2000px on the long edge and re-encode to JPEG or WebP under 1,000,000 bytes. Re-encoding through a canvas also **strips EXIF, including GPS location**. That matters here, since kitchen photos reveal where people live. Record each image's aspect ratio.
- Upload each photo with `uploadBlob`, then create the cook record right away. The PDS garbage-collects blobs that no record references.
- Keep uploads small and fast: if the user switches apps mid-post, the installed PWA may be suspended. On failure, keep the form contents and offer a retry rather than losing the post.
- Test with real iPhone photos, including HEIC originals and portrait orientation.
- **Image proxy** at `/api/img/[did]/[cid]?size=thumb|full`: only serve CIDs referenced by an indexed record (otherwise it's an open proxy). Resolve the author's PDS from their DID document, fetch with `com.atproto.sync.getBlob`, check the content type, resize with `sharp`, cache on disk, and send `Cache-Control: public, max-age=31536000, immutable` (CIDs are content-addressed). Avatars go through the same proxy.

### 6.6 Deletion

Deleting a cook or comment calls `deleteRecord`, removes the row immediately, and asks for confirmation first. Kudos toggling creates or deletes the viewer's single `NS.kudos` record for that cook.

---

## 7. Design

**Phone first, installed as an app.** Design at 375px width first, then make sure it scales sensibly to desktop (a centered column is fine).

**A cookbook crossed with Strava; the photos do the talking.** (Design system set in Phase 6.5; tokens in `app/globals.css`, primitives in `components/ui.tsx`.) Concretely:
- **Color:** warm paper background (`#f8f6f1`, dark `#151311`), warm ink text (`#211d18`, dark `#f3efe8`), one **basil-green accent** (`#2f6b3f`, dark `#8cc596`) used only for interactive elements and active kudos. Plus `surface` (inputs, dialogs), `sunken` (bands between feed cards and sections, photo placeholders), `muted`, `border`, `accent-soft` (toggled-on state), `danger`. Every text pair meets WCAG AA in both schemes. Dark mode is its own palette, not an inversion. No gradients, no decorative illustration. `THEME` in `lib/config.ts` mirrors the backgrounds and accent.
- **Type:** Young Serif (self-hosted via `next/font`) for display only: the wordmark, page titles, dish names, section titles, stat figures and empty-state headings. The system sans for everything else. Use the named scale (`text-hero`, `stat`, `title`, `dish`, `lead`, `body`, `small`, `caption`); Tailwind's default sizes are switched off. No all-caps labels.
- **Icons:** `lucide-react` only. Kudos is a chef's hat (`ChefHat`).
- **Primitives:** `button({ variant, size, full })` with the variants primary, secondary, selected (a toggle that's on), quiet (accent text), subtle (muted text), danger and destructive; `chip(selected)`; `input`; `FieldLabel`; `ErrorText`; `EmptyState`; `PageHeader` (sticky, serif title, optional back button and right-hand action). Don't hand-roll sizes, colors or radii in components (radii: `rounded-control`, `rounded-sheet`, `rounded-full`).
- Feed card: author row (avatar, name, then meal type and relative time underneath), then photos edge to edge on mobile (swipeable carousel with a pill of dots when there's more than one; crop to at most 4:5 in the feed, show the full aspect ratio on detail), then the dish name in the serif, the note truncated to 3 lines, and kudos/comment counts as icons. Cards are separated by an 8px `sunken` band, not hairlines.
- Cook detail: the same author row, all photos, the dish name at `title` size, "Cooked …", the full note, then kudos and comments in banded sections. Deleting your own cook is a quiet icon in the header.
- Profile: serif name, handle, stats as large serif figures with a small label ("cooks this week"), then the follow button (or, on your own, "Find people from Bluesky" and a quiet "Sign out").
- Bottom tab bar: five labelled tabs, **Feed** (`Rows3`), **Search** (`Search`), **Log** (`Plus`, primary, a filled accent pill, in the middle), **Best** (`Trophy`), **Profile** (`User`); each ≥ 44px wide at 375px and active on its own routes. Feed reopens whichever feed you last used. Best opens the viewer's current month (resolved in the browser). The feed header is a two-segment switch, Following | Global; the two feeds stay separate pages (`/following`, `/global`).
- Search: a sticky header with the field (search icon, clear button) and a horizontally scrolling row of meal `chip()`s ("All" first). Before typing, an `EmptyState` hint. People rows (avatar 44, name, handle) above standard feed cards; no people while a meal is picked.
- Best: a sticky month switcher (‹ September 2026 ›, serif), a muted status line ("Leading so far…" for a running month), then one row per meal type: a 104px rounded photo, the meal name (small, muted), the dish in the serif, the author (avatar 24) and the kudos count (`ChefHat`); categories without a winner are a quiet "No winner yet" row. A month with no winners is an `EmptyState` pointing to the global feed.
- Badges: a `Trophy` line, "Best dinner, Sep 2026" (`text-small`, semibold, ink), above the dish name on feed cards and the detail page. Profiles list wins as `chip(false)` links under the stats.
- Sign-in typeahead: an accessible combobox; the list (surface, border, `rounded-control`, rows ≥ 52px with avatar, name and handle) opens **above** the field so the iOS keyboard doesn't cover it.
- Log flow: photo picker first (camera or library), then dish name, meal type as tappable chips, note, and when it was cooked. The submit button shows upload progress.
- Pressed states on everything tappable (scale or tint, `motion-safe` only). CSS transitions only; no animation library.
- Tap targets ≥ 44px. Respect `prefers-color-scheme` for dark mode. Every list has a useful empty state (e.g. the Following feed with no follows points to the import and the global feed).
- Show loading and error states for every write; failed writes must never look like they succeeded.

**Minimal safety valve:** a `DENYLIST_DIDS` env var. The global feed indexes the whole network, so be able to hide an account without deploying new code.

### 7.1 Progressive web app

The app is a website that installs to the home screen. There is no native app and no app store.

- **Manifest** (`app/manifest.ts`): `name` and `short_name` from `APP_NAME`, `display: "standalone"`, `start_url: "/following"`, `scope: "/"`, theme and background colors matching §7, icons at 192px and 512px plus a maskable variant. Also add a 180px `apple-touch-icon`. Use a simple placeholder icon until there's a real name.
- **Feels native**: no browser UI in standalone mode, so every screen needs its own way back (a back button in the header on detail and profile pages). Disable pull-to-refresh bounce only where it fights the UI; keep normal scrolling.
- **Safe areas**: set `viewport-fit=cover` and pad the bottom tab bar and top edge with `env(safe-area-inset-*)`, so nothing sits under the notch or the home indicator.
- **Install hint**: iOS has no install prompt. When the app is open in mobile Safari but not installed (check `navigator.standalone` and `matchMedia('(display-mode: standalone)')`), show a one-time, dismissible banner: "Add to Home Screen: tap Share, then Add to Home Screen." On Android Chrome, use the `beforeinstallprompt` event to offer an Install button instead. Never show either inside the installed app.
- **Service worker**: keep it minimal. It serves an offline fallback page only. Never cache feeds, API responses or anything auth-related.
- **Sessions**: home-screen apps on iOS keep cookies separate from Safari, so a user signs in once inside the installed app. Make that session long-lived and rely on the OAuth client's token refresh so people aren't asked to sign in again.
- **OAuth inside the installed app (highest-risk item)**: sign-in leaves the app for the user's PDS, and on iOS the redirect back may land in Safari instead of the installed app. That would leave the app without the session.
  - First, test the standard flow (§5) from an installed app on a real iPhone.
  - If the session doesn't reach the installed app, implement a claim flow. Before redirecting, the app creates a random pending-login ID, stores it in its own cookie, and passes it through the OAuth state. The callback, wherever it lands, binds the new session to that ID server-side and shows "You're signed in, return to the app." The installed app polls, and also checks when it regains focus, then claims the session with its ID. Pending IDs are single-use and expire after 10 minutes.
- **Camera**: the photo picker uses `<input type="file" accept="image/*" multiple>`, which offers camera or library on both iOS and Android. Test it from the installed app, not only from Safari.

---

## 8. Phases

Each phase ends with a **checkpoint** (§0.1) and a `PROGRESS.md` handoff (§0.8). Run typecheck, lint and tests at each one.

**Phase 0 — Setup, login and install.** Read the references in §0.2. Set up the project following the OAuth tutorial, with local Postgres in Docker, Tap installed and runnable, a `.env.example`, `CLAUDE.md`, `PROGRESS.md` and Playwright. Add the manifest, placeholder icons and safe-area handling from §7.1. *Done when:* the human can sign in and out locally with their Bluesky handle, **and sign-in works from the app installed on a real iPhone's home screen** (use a tunnel such as cloudflared or ngrok to reach the dev server over HTTPS; implement the §7.1 claim flow now if needed). A README explains how to run the app, Postgres, Tap and the tunnel.

**Phase 1 — Lexicons and schema.** Write the four Lexicons, generate code, create the migrations (`timestamptz` throughout) and the `lib/lexicons.ts` re-export. *Checkpoint:* show the Lexicon JSON in full and flag anything you'd change. The human reviews carefully here.

**Phase 2 — Log a cook.** The client-side image pipeline, blob upload, record creation, read-your-own-writes upsert, retry on failure, and a bare-bones "my cooks" list. *Done when:* a cook with 1–4 photos, posted from the installed app on a phone, reads back correctly from the PDS via `getRecord` (also visible at https://pdsls.dev or https://atproto.at), appears in the app, and has EXIF stripped.

**Phase 3 — Sync, global feed, profiles, images.** The Tap webhook, all record and identity handling, the image proxy, the global feed, profile pages and cook detail pages. *Done when:* cooks posted from a second test account appear via Tap, deletes propagate, replaying the same webhook event twice changes nothing (covered by a test), and the index rebuild procedure from §0.14 has been run successfully and documented in the README.

**Phase 4 — Follows.** Follow/unfollow, the following feed, and the Bluesky import with batched `applyWrites`, plus the first-login flow.

**Phase 5 — Kudos, comments, delete.** Kudos toggle, comments, deleting cooks and comments, and the hiding rules for orphans.

**Phase 6 — Stats and polish.** Stats with tests, a full mobile design pass per §7 (with Playwright screenshots at 375px), the install hints and offline fallback from §7.1, empty/loading/error states, and the denylist. Do a walkthrough of the installed app on a real iPhone and, if available, an Android phone.

**Phase 6.5 — UI and UX review.** Everything works, but the app looks like an unstyled scaffold: spacing and hierarchy are weak and it has no identity. The goal is a clean app with a clear character that is pleasant to use. Start on a new branch after the Phase 6 PR is merged. This phase changes how the app looks and feels, never what it does.

1. **Audit first.** Screenshot every screen at 375px in light and dark mode. Sign in with a minted cookie, as in Phase 6. Add local-only fixture rows so the screens show realistic content: several authors, cooks with 1 and 4 photos, a long note, a long dish name, comments and kudos. Remove the rows at the end of the phase. Keep these screenshots as the "before" set, outside the repo. In `PROGRESS.md`, write a short audit per screen covering spacing, hierarchy, alignment, inconsistencies between screens, and missing tap feedback.
2. **Direction: a cookbook crossed with Strava.** From cookbooks and food magazines (NYT Cooking, Bon Appétit): a display typeface for dish names and page titles, warm paper-and-ink tones, generous whitespace, and photos as the hero. From Strava: a steady feed-card rhythm, and stats shown with confidence, as large figures with small labels. Aim for something with character, not a template. Use the `frontend-design` skill if it's available.
3. **§7 is loosened for this phase as follows.** Everything else in §7 still holds.
   - **Type:** one distinctive display face for dish names, page titles, stat figures and the `APP_NAME` wordmark. Body text may stay on the system stack or use a paired text face; use two families at most. Self-host fonts with `next/font` (no runtime requests to Google), subset them, and avoid layout shift.
   - **Color:** a warm off-white background and warm near-black text are allowed. The accent may change from the current orange, but there is still exactly one accent, used for interactive elements and active kudos. Still no gradients and no decorative illustration.
   - **Icons:** one icon set (`lucide-react` or similar), used consistently for tabs, kudos, comments, back, camera, delete and so on. The icon set and the font are the only new dependencies this phase allows.
   - **Dark mode** must be designed, not just inverted. Check every screen in dark mode.
   - **Unchanged:** feed photos run edge to edge on mobile with a crop of at most 4:5, and detail pages show the full aspect ratio. Tap targets stay ≥ 44px. Safe areas stay as they are, and so do the loading, error and empty states from Phase 6 (restyled, still present).
4. **Build the design system before the screens.** Define the tokens in `app/globals.css`: a named type scale, a spacing scale, radii, and light and dark colors. If the background colors change, update `THEME` in `lib/config.ts` to match. Then build shared primitives (buttons and their variants, chips, page header, card, list row, empty state) and use them everywhere. After this phase, components contain no one-off sizes or colors.
5. **Cover every screen:** sign-in (the first impression: the wordmark and a line saying what the app is), the following and global feeds, the cook card, cook detail (photos, kudos, comments, composer), the log flow, the profile (header, stats, cooks), import, the tab bar, the install hint, and the empty, loading, error and not-found states. Rework the skeletons to match the new layouts. Restyle the offline page too: it's self-contained HTML, so update its inline CSS and bump `CACHE` in `public/sw.js`.
6. **Small UX fixes are allowed** when they cut taps or confusion in features §2.1 already has. Examples: a kudos button on feed cards, better defaults, clearer labels, pressed states on tap, and CSS-only transitions (no animation library). List each fix in the checkpoint report. No §2.2 features. If a fix needs a new route or API change, flag it in the report before building it.
7. **No regressions.** Every write still shows its loading and error states, and failed writes never look like they succeeded. Existing unit and e2e tests must pass; update e2e selectors only where visible text changed deliberately. Don't touch the placeholder icons or `APP_NAME`: those belong to Phase 7.
8. **When the phase is done,** rewrite §7 of this spec to describe the design system as built (fonts, palette, scale, primitives), so later phases follow it.

*Checkpoint (one, at the end):* "after" screenshots of every screen at 375px in light and dark, shown next to the "before" set (a local HTML contact sheet is fine), plus desktop at 1280px. Report the font and palette choices with hex values, the list of UX fixes, and test, typecheck and lint results. *Done when:* the human has reviewed the app in the installed PWA on a real iPhone (via the tunnel) and approved it.

**Phase 6.6 — Handle typeahead, best cook, search.** Start on a new branch after the Phase 6.5 PR is merged. This phase adds features on purpose: **search** moves from §2.2 into scope, and **best cook** is new. Neither adds a Lexicon or writes anything to a PDS. Everything new is computed from the existing index, so §0.14 (the index stays rebuildable) holds without changes. Postgres gains indexes only, no stored results. When the phase is done, update §2.1, §2.2 and §7 to match what was built.

1. **Sign-in typeahead.** As you type in the handle field, suggest matching accounts. Tapping one fills the handle and starts sign-in straight away, so it takes one tap.
   - Source: Bluesky's public, unauthenticated `app.bsky.actor.searchActorsTypeahead` at `https://public.api.bsky.app`, limit 6. Call it **from the browser**, not through our server: a proxy would put every user behind one IP and share Bluesky's per-IP rate limit. It's a read, so §0.5 still holds.
   - Start at 2 characters. Debounce (~200ms), abort stale requests, and ignore responses that arrive out of order. Strip a leading `@`.
   - Rows show the avatar, display name and handle, and are ≥ 44px tall. Build it as an accessible combobox (`role="combobox"` + `listbox`; arrow keys, Enter and Escape work).
   - The form sits at the bottom of the screen, so the list opens **above** the field. Otherwise the iOS keyboard covers it. Check this on a real iPhone.
   - The typeahead is a convenience and must never block sign-in. If it errors, is slow or returns nothing, the field behaves exactly as it does today. Accounts that Bluesky's AppView doesn't know (some self-hosted PDSes) won't be suggested; typing the full handle still works.
2. **Best cook.** For each calendar month and each meal type, the cook with the most kudos.
   - **Categories:** the six `knownValues` meal types, in the log form's order. Unknown values ("Other") don't compete.
   - **Month:** the author's local month from `cookedLocalDate`, the same rule as the stats in §6.4.
   - **Score:** the number of distinct kudos authors on the cook. Duplicate kudos records from one author count once. Kudos from the cook's own author don't count, and neither do kudos from accounts that aren't visible (`visibleAccount`). Only visible cooks by visible authors compete.
   - **Threshold and ties:** a cook needs **at least 1 kudos** to win. Ties go to the earliest `cookedAt`, then the lowest `uri`, so there's exactly one winner per category.
   - **Live:** results are computed from the index on read, never stored. The current month shows "Leading so far". A past month can still change if late kudos arrive or a winner is deleted. That's accepted.
   - **Best tab** (`/best`, with one URL per month, e.g. `/best/2026-09`). The page header is a month switcher, ‹ September 2026 ›. It opens on the current month in the viewer's own zone, resolved in the browser as the stats are. Next stops at the current month and Previous at the earliest month with any cook. Below it is one card per category: the category name, the first photo, the dish name in the serif, the author (avatar and name) and the kudos count (`ChefHat`). Tapping a card opens the cook. A category without a winner shows a quiet "No winner yet" row. A month with no winners at all shows an `EmptyState` pointing to the global feed. Add a skeleton for the page.
   - **Badges:** only for **completed** months, meaning the month has ended in every time zone (UTC−12). This keeps the current month's shifting leaders from flickering on cards.
     - *On the cook:* a trophy line on the feed card and the detail page, e.g. "Best dinner, Sep 2026". Look winners up for the whole page in one batch, never with a query per card.
     - *On the profile:* a "Best cooks" row under the stats that lists each win (category and month) newest first, each linking to the cook. Hide it when there are none.
3. **Search** (`/search`). A search field at the top, with the query in the URL (`?q=&meal=`) so Back and shared links keep it.
   - **Dish names:** case-insensitive substring match ("carb" finds "Spaghetti carbonara"), backed by a `pg_trgm` GIN index added in a new migration (Neon supports `pg_trgm`). If accent-insensitive matching is cheap, add it; otherwise flag it. Results are standard feed cards, newest first, paged with the existing cursor pattern.
   - **People:** display names and handles of visible accounts, shown above the cooks (at most 5). The section is hidden while a meal filter is on.
   - **Meal-type chips** (`chip()`), single-select with "All" as the default. They filter the cooks.
   - Start at 2 characters, debounce, and cap the query at 100 characters. Use parameterized queries and escape `%`, `_` and `\` in the pattern. Show a hint before anything is typed and a useful empty state when nothing matches.
   - `GET /api/search?q=&meal=&cursor=`, exercised with curl before building the UI.
4. **Tab bar: five tabs,** Feed · Search · Log · Best · Profile. The icons are `Rows3`, `Search`, the `Plus` pill in the middle, `Trophy` and `User`. Every tab is ≥ 44px wide at 375px, and each is marked active on its own routes. Update §7 to match.
5. **Rules.** No new dependencies. Every new read goes through `visibleAccount`. Migrations are additive. Keep the design system (tokens and primitives from §7), with no one-off sizes or colors. Existing unit and e2e tests must pass.

*Tests:* unit tests against the local Postgres for the winner query and for search. The winner query covers the threshold, ties, month boundaries by `cookedLocalDate` with authors either side of midnight UTC, "Other" excluded, self-kudos and duplicate kudos, denylisted and hidden cooks and accounts, and completed vs current month for badges. Search covers substring and case matching, escaped wildcards, the meal filter, paging and the denylist. Add e2e tests with the Bluesky typeahead stubbed in Playwright (suggestions appear, tapping one starts sign-in, and sign-in still works when the typeahead fails) and for the five-tab bar at 375px. Take screenshots of the new screens in light and dark, with local-only fixture rows that are removed at the end.

*Checkpoint (one, at the end):* screenshots, the queries and their `EXPLAIN` on the fixture data, the decisions made, and test, typecheck and lint results. Include a live check of the typeahead against the real Bluesky API. *Done when:* the human has tried all three features in the installed PWA on a real iPhone (via the tunnel): the typeahead with the iOS keyboard open, the Best tab and badges, and search, and approved them.

**Phase 7 — Deployment prep (blocked until the human provides a domain).** Ask the human for the domain. Swap `NS` and `APP_NAME`, regenerate code, and reset the dev database. Publish the Lexicons and a permission set under the real namespace, following current atproto docs. Replace the placeholder icons, and add production OAuth client metadata, Fly configs for both machines (with the Tap volume), the Neon connection and secrets. Also:
- set health checks with a startup grace period generous enough that slow boots don't fail deploys;
- add error logging the human can check from their phone;
- confirm Neon's restore points are on, and rehearse running migrations against a Neon branch;
- write a deploy and rollback runbook in the README.

Don't deploy without the human's go-ahead.

**Phase 8 — Soft launch.** Launch in steps, not all at once:
1. The human uses the production app alone for a few days: installs it on their phone, posts real cooks, and checks that login, photos (EXIF stripped), feeds and Tap sync all work in production.
2. Invite 5–10 people, then more once that's stable. **No migrations or unrelated deploys on the day invites go out.**
3. Add a feedback link in the app (e.g. a Bluesky mention or email link).
4. During the first week, check error logs and Tap lag daily.
5. Fix only launch-blocking bugs. Everything else, including new feature ideas, goes into a v1.1 list in `PROGRESS.md` rather than into the code.