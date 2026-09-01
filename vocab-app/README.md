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

## Status: Phase 3 - initial vocabulary assessment

What exists right now:

- Express + TypeScript API server with a health endpoint and SQLite wiring
  (via `better-sqlite3` + Drizzle ORM).
- The full language-agnostic database schema, now including assessment
  storage: `languages`, `words`, `word_senses`, `word_relations`, `users`,
  `user_settings`, `user_vocabulary` (with a `known_before_app` flag),
  `assessment_sessions`, `assessment_responses`, `vocabulary_review_history`,
  `vocabulary_collections`, `collection_words`, `learning_sessions`. See
  `docs/database-architecture.md` for the entity relationships and the
  reasoning behind the shared-dictionary/personal-vocabulary split.
- **Initial vocabulary assessment**: an adaptive multiple-choice test
  (`/assessment`) that moves up or down in difficulty based on each
  answer, distinguishes "I don't know" from a wrong guess, and never
  leaks the correct answer to the client. On completion it produces a
  clearly-labeled *estimate* (never a hardcoded number) of vocabulary
  size, an illustrative CEFR-style level, and a confidence rating - then
  adds unrecognized words to `user_vocabulary` as `new` (the first
  learning bank) while marking confidently-known words as `familiar` with
  `known_before_app = true`, so they're never counted as "learned through
  the app." The first completed assessment is flagged `is_baseline` for
  future genuine-growth statistics; later re-assessments are separate
  session rows, so history is never overwritten.
- A single local user is created automatically on first server start
  (single-local-user mode, per the approved scope) - every personal table
  already keys off a real `user_id`, so real multi-user auth later is
  additive, not a schema redesign.
- A small, original (non-copyrighted) English seed dataset - 45 words
  across all three difficulty tiers, multiple parts of speech, a
  multi-sense word (`bank`), and a few synonym/antonym relations - loaded
  via `npm run db:seed`.
- 32 tests (11 database + 21 assessment: adaptive tier movement, scoring,
  and full end-to-end session flow) - all passing.
- React + TypeScript + Vite + Tailwind frontend, mobile-first, with a
  Dashboard page (health check + assessment entry point) and a full
  intro → question → result assessment flow.
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

## Testing performed (Phase 3)

- `npm run test -w server` - 32/32 tests passing: the 11 Phase 2 database
  tests plus 21 new ones covering adaptive tier movement, scoring
  (known/learning split, vocabulary-size estimate, confidence levels), and
  a full end-to-end assessment flow (session start, real seeded questions,
  multi-tier coverage, correct/incorrect/"I don't know" recording,
  preserved history across sessions, known-before-app words excluded from
  "learned," unknown words added as `new`, no duplicate `user_vocabulary`
  rows on re-assessment, and the baseline flag set only on the first
  completed session).
- `npm run build` (server + web) - both compile cleanly with no TypeScript
  errors.
- Fresh `npm run db:push` + `npm run db:seed` (45 words) verified from
  scratch, then the full test suite re-run clean against it.
- Exercised the real running API end-to-end with scripted HTTP requests:
  confirmed a full 20-question adaptive session completes, tier movement
  responds to right/wrong answers, and the resulting `assessment_sessions`
  / `assessment_responses` / `user_vocabulary` rows in the actual SQLite
  file matched the API's reported result exactly.
- Drove the real UI in a headless browser at a 412×915 (Galaxy S24
  Ultra-class) viewport through the entire intro → 20 questions → result
  flow, screenshotting each stage - confirmed large touch-friendly
  buttons, a clear progress indicator, and a correctly labeled
  estimate/confidence/level result screen.
- Confirmed the root Product Image Finder app still starts, and its full
  31-test suite still passes, unaffected by this addition.
- Confirmed via `git status`/`git diff` that no file outside `vocab-app/`
  was touched.
