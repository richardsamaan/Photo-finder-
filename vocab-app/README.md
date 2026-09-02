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

## Status: Phase 6 - daily learning & review experience

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
- **Session engine** (`modules/learning/`, alongside the Phase 5 review/
  queue services rather than a new top-level module - same per-feature
  convention used since Phase 2): a full Daily Learning & Review
  experience built entirely on top of the existing Phase 5 mastery/SRS/
  queue services, never a second prioritization algorithm.
  - Three session types: **Daily Review** (due words, via the existing
    queue service), **Learn New Words** (status=new words), and
    **focused word** (a single word - powers "Practice this word" from
    Word Detail, adding an untracked word to the bank first if needed).
  - Five test types, architected so the remaining five Phase-5 types
    (sentence_completion, context_recognition, listening, active_usage,
    ai_conversation) plug in later without a redesign: multiple choice,
    define-it (english→meaning), name-the-word (meaning→english),
    fill-in-the-blank (from a real example sentence, tolerant of
    inflected forms), and spelling. A deterministic (not random)
    rotation picks test types based on real performance, so sessions stay
    reproducible and struggling words get more recognition-first practice.
  - **Answer-leak prevention is structural, not just UI-level**: the
    question JSON itself never contains the correct answer before
    submission - multiple-choice options carry no correctness field, and
    for the three test types where the word itself *is* the answer
    (name-the-word, spelling, fill-in-the-blank), the word is omitted
    from the payload entirely rather than merely hidden by the client.
  - Grading is always server-side and objective; a wrong answer is
    auto-recorded as `AGAIN` with no further input, while a correct
    answer waits for a separate Hard/Good/Easy choice before anything is
    recorded - the user can never claim an outcome without a genuinely
    correct answer, and the two-step flow can't produce a duplicate
    review history row.
  - Session state (`learning_sessions.items_json`) stores only
    `{userVocabularyId, wordId, testType}` per item - question content is
    always rebuilt fresh from live dictionary data, so a page reload
    (resume) is naturally idempotent and nothing can go stale. Multiple-
    choice's option shuffle is seeded on the session id specifically so a
    resumed question is byte-identical, while a brand-new session on the
    same word still reshuffles (no position-memorization).
  - Session summaries distinguish "known before app" from "learned
    through app" vocabulary growth - reviewing a word you already knew
    is never counted as new vocabulary.
  - **Review difficult words**: a small new session built only from the
    words missed in a prior session, never a repeat of the whole thing.
  - Exiting a session early preserves every already-recorded review and
    never fakes completion of the remaining, unanswered items.
  - Configurable daily limits, enforced server-side:
    `DEFAULT_NEW_WORD_LIMIT` (5), `DEFAULT_DAILY_REVIEW_LIMIT` (20),
    `MAX_SESSION_SIZE` (30).
  - Pronunciation via the browser's free Web Speech API only (no paid
    TTS) - feature-detected, the speak button simply doesn't render if
    unsupported.
- 163 tests (113 from Phases 2-5, plus 2 new migration tests for the
  Phase 6 schema additions, plus 48 new across grading, test-type
  rotation, question building, and the full session engine - lifecycle,
  all five test types, answer-leak prevention including a dedicated
  regression test, resume idempotency for multiple_choice specifically,
  review integration, session summaries, "Review difficult words," and
  focused-word practice) - all passing.
- React + TypeScript + Vite + Tailwind frontend, mobile-first, with
  Dashboard, Assessment, My Vocabulary, Word Detail (now with a working
  "Practice this word" button), the original minimal **Learning Queue**
  screen (`/learning`, kept for direct engine verification), and the new
  polished **Learn** screen (`/learn`) covering session selection,
  question/feedback/completion, and "Review difficult words."
- Same conventions as the root Product Image Finder app (npm workspaces,
  hand-written idempotent SQL migrations, typed fetch client, `.env`-based
  config) so the two apps are easy to reason about side by side.
- `AI_PROVIDER` is wired into config as `none` by default - every core
  feature planned for this app works with zero AI configured; AI only
  powers optional Conversation/Content-Generation features in later phases.

Not built yet (later phases, per the approved architecture): authentication,
the remaining five Phase-5 test types (sentence_completion,
context_recognition, listening, active_usage, ai_conversation), a full
analytics dashboard, AI conversation, AI content generation, export,
reminders, notifications, gamification/achievements, social features, cloud
sync.

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
- The mastery engine and spaced-repetition engine (`modules/mastery/`,
  `modules/spaced-repetition/`) are pure, dependency-free modules so the
  learning algorithm can evolve independently of routes, UI, and storage.
  The Phase 6 session engine (`modules/learning/sessionService.ts` and
  friends) is a thin orchestrator on top of them - it never reimplements
  prioritization or scoring, only session lifecycle, question building,
  and grading.

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

## Testing performed (Phase 6)

- `npm run test` - 163/163 tests passing (113 from Phases 2-5, 2 new
  migration tests, 48 new session-engine tests - see the count breakdown
  above).
- `npm run build` (server + web) - both compile cleanly with no
  TypeScript errors.
- Fresh `rm -rf server/data && npm run db:push && npm run db:seed`
  verified from scratch, then the full test suite re-run clean against it.
- Exercised the real running API end-to-end against the fresh database:
  added a word, started a `focused_word` session, confirmed the served
  question carried no answer-leak, submitted a correct answer, confirmed
  the server graded it, chose a difficulty outcome, confirmed the
  mastery/SRS update and a new `vocabulary_review_history` row tagged
  with the session id, confirmed the session auto-completed and
  `completeSession` returned a correct summary, confirmed My Vocabulary's
  API listing reflected the updated word, and confirmed a second
  `focused_word` session on the same word (simulating "Practice this
  word" again) started cleanly.
- Found and fixed two real bugs during this verification (both now
  covered by dedicated regression tests):
  - **Answer-leak bug**: `buildQuestion` was including the literal word
    text in the payload for `meaning_to_english`, `spelling`, and
    `fill_blank` - the three test types where the word itself *is* the
    answer. Fixed by omitting `word` from the payload entirely for those
    types (it's still included, safely, for `multiple_choice` and
    `english_to_meaning`, where the word is given and the definition is
    what's tested).
  - **Non-idempotent resume for multiple_choice**: `getCurrentQuestion`
    is documented as safe to call repeatedly with no side effects, but
    multiple-choice's distractor/option shuffle used `Math.random()`, so
    a page reload could show a different option order or distractor set.
    Fixed with a deterministic shuffle seeded on the session id (so a
    resumed question is byte-identical) combined with the word id (so a
    *new* session on the same word still reshuffles).
- Drove the real UI in a headless browser at a 412×915 (Galaxy S24
  Ultra-class) viewport end-to-end: session selection, an active
  multiple-choice question, the wrong-answer feedback (auto-continue)
  path, the correct-answer feedback + Hard/Good/Easy path, the
  completion screen (including "Review difficult words" reproducing only
  the one missed word), My Vocabulary, Word Detail, and "Practice this
  word" starting a real focused session - all screenshotted and visually
  confirmed correct, with zero horizontal scrolling on every Phase 6
  screen. (One pre-existing, unrelated 4px overflow was found on the
  Phase 4 My Vocabulary status-filter row, not touched by this phase -
  left as-is per scope.)
- Confirmed the root Product Image Finder app still starts, and its full
  31-test suite still passes, unaffected by this addition.
- Confirmed via `git status`/`git diff` that no file outside `vocab-app/`
  was touched.
