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

## Status: Phase 2 - database & vocabulary data foundation

What exists right now:

- Express + TypeScript API server with a health endpoint and SQLite wiring
  (via `better-sqlite3` + Drizzle ORM).
- The full language-agnostic database schema: `languages`, `words`,
  `word_senses`, `word_relations`, `users`, `user_settings`,
  `user_vocabulary`, `vocabulary_review_history`, `vocabulary_collections`,
  `collection_words`, `learning_sessions`. See
  `docs/database-architecture.md` for the entity relationships and the
  reasoning behind the shared-dictionary/personal-vocabulary split.
- A single local user is created automatically on first server start
  (single-local-user mode, per the approved Phase 2 scope) - every personal
  table already keys off a real `user_id`, so real multi-user auth later is
  additive, not a schema redesign.
- A small, original (non-copyrighted) English seed dataset - 25 words
  across all three difficulty tiers, multiple parts of speech, a
  multi-sense word (`bank`), and a few synonym/antonym relations - loaded
  via `npm run db:seed`.
- 11 database tests covering language/word/sense creation, duplicate
  prevention, review history, archiving instead of deleting, collections,
  and independent per-user vocabulary state - all passing.
- React + TypeScript + Vite + Tailwind frontend, mobile-first, with a single
  Dashboard page that confirms the frontend can reach the backend.
- Same conventions as the root Product Image Finder app (npm workspaces,
  hand-written idempotent SQL migrations, typed fetch client, `.env`-based
  config) so the two apps are easy to reason about side by side.
- `AI_PROVIDER` is wired into config as `none` by default - every core
  feature planned for this app works with zero AI configured; AI only
  powers optional Conversation/Content-Generation features in later phases.

Not built yet (later phases, per the approved architecture): authentication,
vocabulary assessment, mastery engine, spaced repetition, testing modes,
dashboard stats, AI conversation, AI content generation, export, reminders.

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

## Testing performed (Phase 2)

- `npm run test -w server` - 11/11 database tests passing (language/word
  creation, multi-sense words, duplicate user-word prevention, review
  history, archiving instead of deleting, collections, multi-collection
  membership, foreign-key enforcement, independent per-user state).
- `npm run build` (server + web) - both compile cleanly with no TypeScript
  errors.
- `npm run db:push` then `npm run db:seed`, twice in a row - confirmed
  idempotent (word/language/user counts unchanged on the second run).
- Inspected the seeded SQLite file directly: English language row present,
  local user + default settings present (`preferred_language_id` correctly
  pointing at English), 25 words across all three difficulty tiers,
  `bank` carrying its two distinct senses, and all 5 seeded synonym/antonym
  relations resolved correctly.
- Started `npm run dev:server`, confirmed `GET /api/health` still responds
  correctly with the new schema in place.
- Confirmed the root Product Image Finder app still starts, and its full
  31-test suite still passes, unaffected by this addition.
