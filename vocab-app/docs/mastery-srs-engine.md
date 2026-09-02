# Mastery + Spaced Repetition Engine (Phase 5)

## Architecture

```
modules/mastery/           pure - "how well is this word known?"
  types.ts, config.ts, engine.ts

modules/spaced-repetition/ pure - "when should this word come up again?"
  types.ts, config.ts, srsEngine.ts

modules/learning/          impure - wires the two pure engines to the DB
  reviewService.ts   recordReview(), recordDontKnow()
  queueService.ts    getLearningQueue(), getDueReviews(), getLearningStats()
  priority.ts        pure queue-ranking function
```

Both pure modules take and return plain data (no DB types) and are tested
without a database (`engine.test.ts`, `srsEngine.test.ts`). `learning/`
does the DB reads/writes and is the only layer the routes call.

## Mastery model

A word's mastery is scored per **dimension** (`recognition`, `recall`,
`context`, `usage`, `spelling`, `listening`), not as one blended number
from the start. Each `test_type` maps to exactly one dimension and carries
an **evidence strength** (0–1) - recognition-only test types (multiple
choice) are weak evidence; production test types (`meaning_to_english`,
`active_usage`) are strong. This is what makes recall count for more than
recognition even though both use the same update formula.

**Per-dimension score**: fold over that dimension's events in
chronological order. A success nudges the score toward 100 by
`learningRate × evidenceStrength × outcomeBonus`; a failure nudges it
toward 0 by `forgetRate × evidenceStrength × outcomeBonus`, clamped to
[0, 100] after every step. Diminishing returns are automatic (it's an
exponential-moving-average shape) - no hard "N successes = done" step. A
dimension with **zero** events is `null`, not `0` - the overall score is a
weighted average of only the dimensions with evidence, so a word tested
only via multiple choice gets its overall score entirely from
`recognition`, never diluted by assuming untested dimensions are known or
unknown.

**Status thresholds** (`modules/mastery/config.ts`):
`learning ≥ 30`, `familiar ≥ 60`, `mastered ≥ 85` against the overall
score - but crossing 85 is only a *candidate*. Reaching `mastered` also
requires `successfulReviews ≥ MASTERY_MIN_SUCCESSFUL_REVIEWS` (10) and
zero failures in the last `MASTERY_RECENT_FAILURE_WINDOW` (3) reviews. A
word can have a high score today and still be capped at `familiar` if it
hasn't earned that evidence yet, or if it just tripped up.

## Decay (forgetting)

`user_vocabulary.mastery_score` is the **base** score - only a review
event changes it, never the passage of time. `effectiveMasteryScore` is
computed at read time: exponential decay from `lastReviewedAt` (or
`firstEncounteredAt` if never reviewed), with a half-life that scales with
the base score itself (`DECAY_MIN_HALF_LIFE_DAYS` ≈ 1 week for a shaky
word, up to `DECAY_MIN_HALF_LIFE_DAYS + DECAY_MAX_HALF_LIFE_BONUS_DAYS` ≈ 3
months for a well-mastered one). This needs only `{baseScore,
lastReviewedAt, firstEncounteredAt}` - no extra query per word - so it's
cheap to compute for every row in a queue candidate set.

## Spaced repetition

`modules/spaced-repetition/srsEngine.ts` exports `SrsEngine`, an
interface with `initialState()` / `scheduleNext(state, outcome)` -
`modifiedSm2Engine` is the first implementation; swap in a different one
(e.g. FSRS) later without touching `reviewService.ts`, routes, or UI.

It's a **modified** SM-2, not a port: named outcomes replace SM-2's single
0–5 "quality" scale.

| Outcome | Effect |
|---|---|
| `again` / `dont_know` | interval → 1 day, ease factor −0.2 (floor 1.3), repetitions → 0 |
| `hard` | a real success, but interval grows only ×1.2 (modest), ease factor −0.15 |
| `good` | staged growth: rep 1 → 1 day, rep 2 → 6 days, rep 3+ → `interval × easeFactor` |
| `easy` | same staged growth as `good` **plus** an ease-factor bonus (+0.15) and a ×1.3 interval multiplier - substantially longer, not just slightly |

`SrsState {intervalDays, easeFactor, repetitions}` isn't stored on
`user_vocabulary` - it's derived from the most recent
`vocabulary_review_history` row (`new_interval_days`, `ease_factor`,
`repetitions`), since that table already has to record it for the
"reconstruct history" requirement. One less column set to keep in sync.

## Review outcomes → evidence + `result` mapping

`AGAIN`/`HARD`/`GOOD`/`EASY`/`DONT_KNOW` are stored as `outcome` (drives
mastery + SRS); `result` (`correct`/`incorrect`/`partial`) is kept for
simpler high-level queries: `again`/`dont_know` → `incorrect`, `hard` →
`partial`, `good`/`easy` → `correct`.

## "I don't know this word" (reconsidered from Phase 4)

Phase 4 hard-reset the word to `status=new, mastery=0`. Phase 5's
`recordDontKnow` (`modules/learning/reviewService.ts`) instead records a
real `dont_know` review event through the same `recordReview` pipeline: if
the word already has history, its evidence is nudged down (not zeroed),
`needsReview` is set, and the interval collapses to 1 day - a genuinely
mastered word that gets a "don't know" doesn't lose its history or drop to
zero, but it does come back for review soon. If the word has never been
seen before, a `user_vocabulary` row is created first (status `new`,
matching Add Word), then the same `dont_know` event is recorded - so even
a first encounter leaves a real, queryable history row instead of being
silently discarded. `english_to_meaning` is the nominal test type used for
this self-report, since "what does this mean" is the closest real
test-type semantic to declaring you don't know a word.

## Review queue priority

Not a `next_review_at` sort. `modules/learning/priority.ts`:

```
priority = (needsReview ? 1000 : 0)
         + overdueDays × 10
         + (100 − effectiveMasteryScore) × 2
         + (status === "learning" ? 50 : 0)
         + min(incorrectCount, 10) × 5
```

Needs-review always wins; beyond that, overdue amount, weak (decayed)
retention, active-learning status, and a history of mistakes all push a
word up, so a badly-decayed mastered word can legitimately outrank a
barely-overdue one still in `learning`.

## Why mastered words are retained, not deleted

A mastered word keeps its row, mastery score, full review history, and
collection memberships forever - `archived` (unused by this phase) and
deletion are never touched by the review engine. It simply stops
appearing in the active queue because its SRS interval is long and its
decay half-life is long. If it's forgotten enough that
`effectiveMasteryScore` drops below the `familiar` threshold, it
reappears with `reason: "mastered_decayed"` even though its formal
`next_review_at` hasn't arrived - this is a **live** check computed when
the queue is built, not a persisted flag requiring a background sweep (no
job scheduler exists yet in this project).

## Known limitation: queue candidate set

`getLearningQueue` pre-filters in SQL to `next_review_at IS NULL OR
next_review_at <= now OR needs_review = 1 OR status = 'mastered'`, capped
at 500 candidate rows, then does the decay/priority computation in JS over
that set. Including all `mastered` rows is necessary for the live
decay-return check (their `next_review_at` alone can't tell "quietly
forgotten" from "still fine"), but at tens of thousands of mastered words
per user this candidate set would need a background job to pre-compute
decay flags instead of checking live on every request. Worth revisiting
once a job scheduler exists (see Phase 13's reminder/notification work).

## Schema changes

`vocabulary_review_history` (created in Phase 2, never written to until
this phase - zero migration risk for real data) gained: `outcome`,
`previous_interval_days`, `new_interval_days`, `ease_factor`,
`repetitions`, `next_review_at`, `was_due`, `successful`. `test_type`'s
allowed values changed from an ad hoc `{recognition, recall, ...}` set to
the ten categories this phase requires. Applied via the same idempotent
`ensureColumn` upgrade path Phase 3 introduced (`db/migrate.ts`), covered
by `db/migrate.test.ts`.
