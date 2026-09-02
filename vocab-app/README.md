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

## Status: Phase 4 - My Vocabulary / personal vocabulary bank

What exists right now:

- Express + TypeScript API server with a health endpoint and SQLite wiring
  (via `better-sqlite3` + Drizzle ORM).
- The full language-agnostic database schema (unchanged since Phase 2 -
  Phase 4 needed no schema additions): `languages`, `words`, `word_senses`,
  `word_relations`, `users`, `user_settings`, `user_vocabulary` (with a
  `known_before_app` flag), `assessment_sessions`, `assessment_responses`,
  `vocabulary_review_history`, `vocabulary_collections`, `collection_words`,
  `learning_sessions`. See `docs/database-architecture.md` for the entity
  relationships.
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
- React + TypeScript + Vite + Tailwind frontend, mobile-first, with
  Dashboard, Assessment, My Vocabulary, and Word Detail screens.
- Same conventions as the root Product Image Finder app (npm workspaces,
  hand-written idempotent SQL migrations, typed fetch client, `.env`-based
  config) so the two apps are easy to reason about side by side.
- `AI_PROVIDER` is wired into config as `none` by default - every core
  feature planned for this app works with zero AI configured; AI only
  powers optional Conversation/Content-Generation features in later phases.

Not built yet (later phases, per the approved architecture): authentication,
mastery engine, spaced repetition, other testing modes, dashboard stats, AI
conversation, AI content generation, export, reminders.

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

## Testing performed (Phase 4)

- `npm run test -w server` - 58/58 tests passing: 11 Phase 2 database + 21
  Phase 3 assessment + 26 new (vocabulary bank: user-scoping, search
  including case-insensitivity, every filter, sorting, word detail
  completeness including multi-sense words, Add Word for both new and
  existing words, "I don't know" create-and-reset behavior, empty states,
  aggregated summary counts; collections: create, duplicate-name
  rejection, add/remove/multi-membership, deleting a collection leaves
  the word and dictionary entry untouched, ownership enforcement).
- `npm run build` (server + web) - both compile cleanly with no
  TypeScript errors.
- Fresh `npm run db:push` + `npm run db:seed` verified from scratch, then
  the full test suite re-run clean against it.
- Exercised the real running API end-to-end with scripted HTTP requests
  covering add word, word detail, create/list collections, add/remove
  collection membership, then ran a real assessment through the API and
  confirmed search/filter/sort against the resulting real data (e.g. a
  definition-text search correctly matched a word whose definition
  contained the search term, even though the word itself didn't).
- Drove the real UI in a headless browser at a 412×915 (Galaxy S24
  Ultra-class) viewport: My Vocabulary (stat tiles, filter chips, search,
  collections row, sort), the collections manager bottom sheet (create),
  Add Word (with the honest "Definition not yet available" placeholder,
  no invented content), and the word detail page (meanings, dates,
  collection checkboxes, actions) - all screenshotted and visually
  confirmed correct.
- Confirmed the assessment (Phase 3) still completes correctly end-to-end
  after the `upsertUserVocabulary` refactor that both features now share.
- Confirmed the root Product Image Finder app still starts, and its full
  31-test suite still passes, unaffected by this addition.
- Confirmed via `git status`/`git diff` that no file outside `vocab-app/`
  was touched.
