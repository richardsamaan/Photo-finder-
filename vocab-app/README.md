# Vocabulary Intelligence Platform

A personal vocabulary learning system: tracks exactly which words you know,
don't know, are learning, or have mastered, and drives retention with
spaced repetition and varied testing - not one-and-done multiple choice.

This app lives entirely inside `vocab-app/` as an independent sibling to the
Product Image Finder & Catalog Generator at the repo root - separate
package.json, separate database, separate ports. Neither app touches the
other's code or data.

Version 1 covers English only, but the data model (`languages` → `words` →
`user_vocabulary`) is language-agnostic from day one - adding French, Spanish,
etc. later means adding rows, not redesigning tables.

---

## Status: Phase 5 - mastery engine + spaced repetition engine

What exists right now:

- Express + TypeScript API server with a health endpoint and SQLite wiring
  (via `better-sqlite3` + Drizzle ORM).
- The full language-agnostic database schema: `languages`, `words`,
  `word_senses`, `word_relations`, `users`, `user_settings`,
  `user_vocabulary` (with a `known_before_app` flag), `assessment_sessions`,
  `assessment_responses`, `vocabulary_review_history` (now carrying the
  Phase 5 mastery/SRS columns: `outcome`, interval/ease/repetitions,
  `next_review_at`, `was_due`, `successful`), `vocabulary_collections`,
  `collection_words`, `learning_sessions`. See `docs/database-architecture.md`
  for the entity relationships and `docs/mastery-srs-engine.md` for the
  learning engine's design.
- **Mastery engine** (`modules/mastery/`, pure): scores a word across six
  evidence dimensions (recognition, recall, context, usage, spelling,
  listening) from its real review history - an untested dimension is
  `null`, never assumed to be 0 or proven. Overall mastery is a weighted
  average of only the dimensions with evidence. Reaching `mastered` status
  requires both a high score **and** at least 10 successful reviews with no
  recent failure - never a single lucky answer. A separate decay model
  computes *effective* (time-decayed) mastery at read time without ever
  touching the persisted base score.
- **Spaced repetition engine** (`modules/spaced-repetition/`, pure): a
  pluggable `SrsEngine` interface, with a modified SM-2 as the first
  implementation - `AGAIN`/`HARD`/`GOOD`/`EASY`/`DONT_KNOW` outcomes each
  produce distinct interval/ease-factor behavior (documented, not a blind
  SM-2 port).
- **Learning module** (`modules/learning/`, DB-backed): `recordReview`
  (the only way mastery/status/interval/next-review ever change - always
  server-computed, never client-supplied) and a prioritized review queue
  (`GET /api/learning/queue`) that goes well beyond a `next_review_at`
  sort - needs-review words first, then overdue amount, decayed retention,
  learning status, and mistake history. Mastered words naturally leave the
  active queue (long intervals + slow decay) and **can return** if
  genuinely forgotten, verified end-to-end against the real API.
- "I don't know this word" (`POST /api/vocabulary/dont-know` and
  `/api/learning/dont-know`) was reconsidered now that a real mastery
  engine exists: it no longer hard-resets a word to zero - it records a
  genuine negative review event, preserving history and nudging evidence
  down while scheduling a near-term review.
- **Initial vocabulary assessment**: an adaptive multiple-choice test
  (`/assessment`) that discovers what the user already knows vs. what's
  new, producing a clearly-labeled estimate, level, and confidence rating.
- **My Vocabulary** (`/vocabulary`): the central library of the user's
  personal vocabulary bank.
  - Summary stat tiles (total, learning, needs review, mastered) computed
    from the database via SQL aggregation, plus a dedicated **known
    before app vs. learned through app** split so progress is never
    inflated by counting words the user already knew.
  - Search (word, definition, translation, part of speech - case
    insensitive), a single-select filter row (All / New / Learning /
    Familiar / Mastered / Needs Review / Known Before App / Learned
    Through App), 7 sort options, and pagination - all server-side so
    this stays fast as a vocabulary grows into the thousands.
  - A word detail page with pronunciation, all meanings, examples,
    synonyms/antonyms/related words, mastery/status, review history
    dates, collection membership, and actions: mark "I don't know this,"
    copy word, copy details, add/remove collections.
  - **Add Word**: manually add any word - reuses the dictionary entry if
    it exists, otherwise creates a bare entry with an honest "not yet
    available" placeholder rather than an invented definition.
  - **Collections**: create, rename, delete, and manage membership
    (a word can belong to several), via a lightweight bottom-sheet
    manager - independent of mastery status.
  - "I don't know this word" is one reusable service function
    (`upsertUserVocabulary`) - the same one the assessment and Add Word
    both call, so every future capture path (AI conversation, imported
    text, etc.) has one place to plug into instead of reimplementing this
    logic per screen.
- A single local user is created automatically on first server start
  (single-local-user mode, per the approved scope) - every personal table
  already keys off a real `user_id`, so real multi-user auth later is
  additive, not a schema redesign.
- A small, original (non-copyrighted) English seed dataset - 45 words
  across all three difficulty tiers, multiple parts of speech, a
  multi-sense word (`bank`), and a few synonym/antonym relations - loaded
  via `npm run db:seed`.
- 58 tests (11 database + 21 assessment + 26 vocabulary bank/collections)
  - all passing.
- 113 tests (89 from Phases 2-4 plus 24 new: mastery engine, SRS engine,
  queue priority, review service, queue/stats service, and migration
  behavior) - all passing.
- React + TypeScript + Vite + Tailwind frontend, mobile-first, with
  Dashboard, Assessment, My Vocabulary, Word Detail, and a minimal
  **Learning Queue** screen (`/learning`) built only to verify the engine
  end-to-end, not the polished Daily Review experience.
- Same conventions as the root Product Image Finder app (npm workspaces,
  hand-written idempotent SQL migrations, typed fetch client, `.env`-based
  config) so the two apps are easy to reason about side by side.
- `AI_PROVIDER` is wired into config as `none` by default - every core
  feature planned for this app works with zero AI configured; AI only
  powers optional Conversation/Content-Generation features in later phases.

Not built yet (later phases, per the approved architecture): authentication,
the polished Daily Review experience, other testing modes, a full analytics
dashboard, AI conversation, AI content generation, export, reminders.

---

## Architecture

```
vocab-app/
  server/    Node.js + TypeScript + Express API, SQLite (better-sqlite3 + Drizzle)
  web/       React + TypeScript + Vite + Tailwind CSS (mobile-first)
  storage/   Runtime data for later phases (exports, cached AI content)
```

- Backend: Express REST API, SQLite via `better-sqlite3` (file-based, zero
  external DB server) with Drizzle ORM. Migrations in
  `server/src/db/migrate.ts` run automatically on boot; the schema itself
  is defined in `server/src/db/schemaSql.ts` (raw, idempotent SQL - the
  source of truth) and mirrored in `server/src/db/schema.ts` (typed Drizzle
  queries). See `docs/database-architecture.md` for the full design.
- Frontend: React + Vite + Tailwind SPA, mobile-first.
- The mastery engine and spaced-repetition engine (Phases 6-7) will be pure,
  dependency-free modules so the learning algorithm can evolve independently
  of routes, UI, and storage.

---

## Setup

### Prerequisites
- Node.js ≥ 20
- npm

### Install

```bash
cd vocab-app
cp .env.example .env
npm install --workspaces
npm run db:push    # creates all tables
npm run db:seed    # loads English + the seed word set (idempotent, safe to re-run)
```

### Run in development

```bash
npm run dev
```

Runs the API on `http://localhost:4001` and the Vite dev server on
`http://localhost:5174` (proxies `/api` to the API). Open
`http://localhost:5174`.

These ports are deliberately different from the root Photo Finder app
(`4000`/`5173`) so both apps can run at the same time without conflict.

### Run in production

```bash
npm run build
NODE_ENV=production npm run start
```

---

## Environment variables (`vocab-app/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (default 4001) | API server port |
| `DATABASE_PATH` | no | SQLite file path (relative to `vocab-app/`) |
| `STORAGE_DIR` | no | Where exports/cached content will be written (later phases) |
| `CORS_ORIGIN` | no | Allowed frontend origin |
| `AI_PROVIDER` | no (default `none`) | `none` \| `anthropic` \| `openai` \| `gemini` - all optional, core app works fully with `none` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | only if using that provider | Used starting Phase 10 (AI conversation) |

---

## Testing performed (Phase 5)

- `npm run test -w server` - 113/113 tests passing: 89 from Phases 2-4
  plus 24 new - mastery engine (dimension scoring, evidence-strength
  differences, status thresholds, the mastery evidence gate, decay),
  SRS engine (all four outcomes' interval/ease behavior, due/overdue
  detection), queue priority (pure ranking function), review service
  (history creation, mastery/status/interval/needs-review updates, the
  full New→Learning→Familiar→Mastered flow, a forgotten mastered word
  returning, the reconsidered "I don't know" behavior), queue/stats
  service, and migration behavior (idempotent column upgrades against a
  simulated pre-Phase-5 table with existing rows).
- `npm run build` (server + web) - both compile cleanly with no
  TypeScript errors.
- Fresh `npm run db:push` + `npm run db:seed` verified from scratch, then
  the full test suite re-run clean against it.
- Exercised the real running API end-to-end: confirmed the assessment
  still completes correctly; added a word and drove it through 10 real
  `POST /api/learning/review` calls to `mastered` status (crossing
  New→Learning→Familiar→Mastered exactly as designed); confirmed My
  Vocabulary still lists the mastered word with full history intact;
  directly aged its `last_reviewed_at` by 400 days and confirmed it
  reappeared in `/api/learning/queue` with `reason: "mastered_decayed"`
  even though its formal next-review date was still a year out; confirmed
  a request with injected `masteryScore`/`status`/`newIntervalDays`
  fields was silently ignored and the server's own independently-computed
  values were used instead.
- Drove the real UI in a headless browser at a 412×915 (Galaxy S24
  Ultra-class) viewport: the new Learning Queue screen (stats, due/overdue/
  needs-review/new/learning/mastered counts, per-word Again/Hard/Good/Easy
  buttons actually submitting reviews and updating the list) - screenshotted
  and visually confirmed correct.
- Confirmed the root Product Image Finder app still starts, and its full
  31-test suite still passes, unaffected by this addition.
- Confirmed via `git status`/`git diff` that no file outside `vocab-app/`
  was touched.
