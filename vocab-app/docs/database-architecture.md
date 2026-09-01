# Database Architecture (Phase 2-3)

## Entity overview

```
Shared dictionary (identical for every user)
  languages
    └─ words                (unique per language, by normalized spelling)
         ├─ word_senses      (a word can have multiple meanings)
         └─ word_relations   (synonym / antonym / related, word ↔ word)

Personal data (one copy per user)
  users
    ├─ user_settings                     (1:1)
    ├─ assessment_sessions               (one row per assessment run, never overwritten)
    │     └─ assessment_responses         (one row per question answered)
    ├─ user_vocabulary                   (one row per user+word)
    │     └─ vocabulary_review_history    (every test attempt, ever)
    ├─ vocabulary_collections
    │     └─ collection_words             (→ user_vocabulary, many-to-many)
    └─ learning_sessions
```

## Why `words` and `user_vocabulary` are separate

`words`/`word_senses` hold the dictionary content itself - spelling,
definitions, part of speech, examples. This data is the same no matter who
is learning it, so it lives once per `(language, word)`.

`user_vocabulary` holds one user's *relationship* with one word: status,
mastery score, review counts, next review date. It references a word by
`word_id` but stores nothing about the word itself.

This split is what makes the last test in Phase 2 possible: two different
`user_id`s can each hold a `user_vocabulary` row pointing at the same
`word_id`, with completely independent `status`/`mastery_score`/history -
because personal state was never mixed into the dictionary row. Deleting or
correcting a definition never touches anyone's learning progress, and
adding a user never touches the dictionary.

## Multi-language support

Nothing in the schema encodes "English." A word belongs to a language via
`language_id`; adding French means inserting a `languages` row (`code: "fr"`)
and populating `words`/`word_senses` for it - no migration, no new tables.
`user_vocabulary` already stores `language_id` denormalized from the word
for fast per-language queries (e.g. "my French vocabulary") without a join.

## Review history, not just a running score

`vocabulary_review_history` records every test attempt - `test_type`,
`result`, the mastery score immediately before and after. `user_vocabulary`
itself only holds the *current* rollup (`mastery_score`, `review_count`,
`correct_count`, etc.); the history table is what a later mastery/SRS
engine will read to understand a trend, not just a snapshot. Nothing here
computes mastery yet - that's Phase 6.

## Initial assessment: known-before-app vs. learned-through-app

The assessment (Phase 3) is the first real writer of `user_vocabulary`.
Each run is one `assessment_sessions` row, holding its own computed
`estimated_vocabulary_size`/`estimated_level`/`confidence` and never
overwritten by a later run - re-assessment is always a *new* session row,
so growth over time stays queryable (`is_baseline = true` marks only the
user's first-ever completed session, the reference point later statistics
compare against). Every question answered is its own `assessment_responses`
row (word, difficulty, selected answer, correctness, "I don't know" flag,
response time) - a full history, not just a final tally.

On completion, each answered word is upserted (never blind-inserted) into
`user_vocabulary`: a confidently-recognized word becomes `status = familiar`
with `known_before_app = true`; anything else (a wrong guess or "I don't
know") becomes `status = new` with `known_before_app = false`. That flag is
the whole point - it is what lets a later dashboard compute "words learned
since starting the app" as words where `known_before_app = false`, instead
of inflating progress by counting words the user already knew.

## Multi-user readiness (still single-local-user today)

Every personal table is keyed by a real `user_id` foreign key, exactly as
it would be with real accounts. Right now there is exactly one row in
`users` (`id = "user_local"`, created automatically on first server start
by `modules/users/localUser.ts`), and nothing resolves a session - the app
just always acts as that one user. Adding real authentication later means
resolving `user_id` from a login session instead of a constant; no table
changes, no data migration.

## Data integrity

- `languages.code` is unique - no duplicate language rows.
- `words` has a unique `(language_id, normalized_word)` index - no
  duplicate words within a language (`"Bank"` and `"bank"` collide, on
  purpose).
- `user_vocabulary` has a unique `(user_id, word_id)` index - a user cannot
  add the same word twice; the insert throws instead of silently
  duplicating.
- Foreign keys are enforced at the SQLite level (`PRAGMA foreign_keys = ON`,
  set in `db/client.ts`), with `ON DELETE` behavior chosen per relationship:
  `CASCADE` for data that's meaningless without its parent (a user's
  settings, their review history, their collection memberships), `RESTRICT`
  for the shared dictionary (a word can't be deleted out from under a
  language, or out from under a user who has learning history on it).
- Mastered words are **never deleted**. `user_vocabulary.archived` removes
  a word from the active review queue without touching the row - full
  history stays queryable forever.

## Files

- `server/src/db/schema.ts` - Drizzle ORM table definitions (typed
  queries).
- `server/src/db/schemaSql.ts` - the actual DDL, hand-written and
  idempotent (`CREATE TABLE IF NOT EXISTS ...`), same convention as the
  root Photo Finder app. This is the single source of truth for the schema;
  `schema.ts` mirrors it for TypeScript.
- `server/src/db/migrate.ts` - applies `schemaSql.ts` to the real database
  (`npm run db:push`).
- `server/src/db/testUtils.ts` - applies the same `schemaSql.ts` to an
  isolated in-memory database for tests.
- `server/src/db/seed-data.ts` / `seed.ts` - the Phase 2 seed dataset and
  the idempotent script that loads it (`npm run db:seed`). See the license
  note at the top of `seed-data.ts`.
- `server/src/modules/users/localUser.ts` - creates the one local user (and
  their default settings row) on first boot.

## Seed data source and license

Every definition and example sentence in `seed-data.ts` was written
originally for this project - none are copied from a proprietary
dictionary. Frequency ranks are illustrative placeholders, not pulled from
a specific corpus. Real dictionary enrichment (e.g. via the free,
Wiktionary-based dictionaryapi.dev, CC BY-SA) is a good candidate for a
later phase, but only as an optional enrichment step - the core database
must never require a live external API just to read words that are
already stored.
