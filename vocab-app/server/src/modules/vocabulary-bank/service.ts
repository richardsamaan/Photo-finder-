import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { words, wordSenses, wordRelations, userVocabulary, vocabularyCollections, collectionWords } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import type {
  VocabularyListParams,
  VocabularyListResult,
  VocabularyStatus,
  VocabularySummary,
  WordDetail,
  SortKey,
} from "./types.js";

type Db = typeof RealDb;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

// ============================================================
// Reusable upsert - the single place every feature that touches a
// user's personal vocabulary state goes through: the initial assessment
// (Phase 3), "Add Word" and "I don't know this word" (Phase 4), and every
// future capture path (AI conversation, imported text, etc.) share this
// instead of re-implementing the same insert-or-update logic.
// ============================================================

export interface UserVocabularyPatch {
  status: VocabularyStatus;
  knownBeforeApp: boolean;
  masteryScore: number;
  confidenceScore: number;
}

export function upsertUserVocabulary(
  db: Db,
  userId: string,
  wordId: string,
  patch: UserVocabularyPatch
): { userVocabularyId: string; created: boolean } {
  const existing = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, wordId)))
    .get();

  if (existing) {
    db.update(userVocabulary).set(patch).where(eq(userVocabulary.id, existing.id)).run();
    return { userVocabularyId: existing.id, created: false };
  }

  const id = newId("uv");
  db.insert(userVocabulary)
    .values({ id, userId, wordId, ...patch })
    .run();
  return { userVocabularyId: id, created: true };
}

// ============================================================
// Add Word - manual entry. Reuses the existing dictionary row if the
// word is already known to the app; otherwise creates a bare `words` row
// with no senses. It never invents a definition - the word detail page
// shows a clear "not yet available" placeholder instead of fake content.
// ============================================================

export interface AddWordResult {
  userVocabularyId: string;
  wordId: string;
  wordCreated: boolean;
}

export function addWord(db: Db, userId: string, languageId: string, rawWord: string): AddWordResult {
  const trimmed = rawWord.trim();
  const normalized = normalizeWord(trimmed);
  if (!normalized) throw new Error("Please enter a word.");

  let wordRow = db
    .select()
    .from(words)
    .where(and(eq(words.languageId, languageId), eq(words.normalizedWord, normalized)))
    .get();

  let wordCreated = false;
  if (!wordRow) {
    const wordId = newId("word");
    db.insert(words).values({ id: wordId, languageId, word: trimmed, normalizedWord: normalized }).run();
    wordRow = db.select().from(words).where(eq(words.id, wordId)).get()!;
    wordCreated = true;
  }

  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordRow.id, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });

  return { userVocabularyId, wordId: wordRow.id, wordCreated };
}

// "I don't know this word" moved to modules/learning/reviewService.ts
// (recordDontKnow) in Phase 5 - now that a real mastery/SRS engine
// exists, it's a proper learning-engine event (preserves history,
// nudges evidence down, schedules a near-term review) rather than the
// hard reset-to-zero this module used to do directly.

// ============================================================
// Summary counts - aggregated in SQL, not pulled into JS, so this stays
// fast as a user's vocabulary grows into the thousands.
// ============================================================

export function getSummary(db: Db, userId: string): VocabularySummary {
  const rows = db
    .select({
      status: userVocabulary.status,
      needsReview: userVocabulary.needsReview,
      knownBeforeApp: userVocabulary.knownBeforeApp,
      count: sql<number>`count(*)`,
    })
    .from(userVocabulary)
    .where(eq(userVocabulary.userId, userId))
    .groupBy(userVocabulary.status, userVocabulary.needsReview, userVocabulary.knownBeforeApp)
    .all();

  const summary: VocabularySummary = {
    total: 0,
    new: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
    needsReview: 0,
    knownBeforeApp: 0,
    learnedThroughApp: 0,
  };

  for (const row of rows) {
    summary.total += row.count;
    summary[row.status] += row.count;
    if (row.needsReview) summary.needsReview += row.count;
    if (row.knownBeforeApp) summary.knownBeforeApp += row.count;
    else summary.learnedThroughApp += row.count;
  }

  return summary;
}

// ============================================================
// List / search / filter / sort - paginated so this stays workable as a
// user's vocabulary grows into the thousands or tens of thousands.
// ============================================================

function buildOrderBy(sortKey: SortKey = "recent") {
  switch (sortKey) {
    case "alphabetical":
      return [asc(words.word)];
    case "mastery":
      return [desc(userVocabulary.masteryScore)];
    case "difficult":
      return [asc(userVocabulary.masteryScore)];
    case "forgotten":
      return [desc(userVocabulary.incorrectCount)];
    case "reviewed":
      return [sql`${userVocabulary.lastReviewedAt} IS NULL`, desc(userVocabulary.lastReviewedAt)];
    case "nextReview":
      return [sql`${userVocabulary.nextReviewAt} IS NULL`, asc(userVocabulary.nextReviewAt)];
    case "recent":
    default:
      return [desc(userVocabulary.firstEncounteredAt)];
  }
}

export function listVocabulary(db: Db, userId: string, params: VocabularyListParams): VocabularyListResult {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));

  const conditions = [eq(userVocabulary.userId, userId)];
  if (params.status) conditions.push(eq(userVocabulary.status, params.status));
  if (params.needsReview !== undefined) conditions.push(eq(userVocabulary.needsReview, params.needsReview));
  if (params.known === "known_before_app") conditions.push(eq(userVocabulary.knownBeforeApp, true));
  if (params.known === "learned_through_app") conditions.push(eq(userVocabulary.knownBeforeApp, false));
  if (params.difficulty) conditions.push(eq(words.difficultyLevel, params.difficulty));
  if (params.collectionId) {
    const collectionId = params.collectionId;
    conditions.push(
      sql`${userVocabulary.id} IN (SELECT user_vocabulary_id FROM collection_words WHERE collection_id = ${collectionId})`
    );
  }
  if (params.search) {
    const term = `%${normalizeWord(params.search)}%`;
    conditions.push(sql`(
      ${words.normalizedWord} LIKE ${term}
      OR EXISTS (
        SELECT 1 FROM word_senses ws
        WHERE ws.word_id = ${words.id}
          AND (LOWER(ws.definition) LIKE ${term} OR LOWER(ws.translation) LIKE ${term} OR LOWER(ws.part_of_speech) LIKE ${term})
      )
    )`);
  }

  const whereClause = and(...conditions);
  const orderBy = buildOrderBy(params.sort);

  const items = db
    .select({
      userVocabularyId: userVocabulary.id,
      wordId: words.id,
      word: words.word,
      difficultyLevel: words.difficultyLevel,
      status: userVocabulary.status,
      needsReview: userVocabulary.needsReview,
      masteryScore: userVocabulary.masteryScore,
      knownBeforeApp: userVocabulary.knownBeforeApp,
      firstEncounteredAt: userVocabulary.firstEncounteredAt,
      lastReviewedAt: userVocabulary.lastReviewedAt,
      nextReviewAt: userVocabulary.nextReviewAt,
      pronunciation: wordSenses.pronunciation,
      phonetic: wordSenses.phonetic,
      partOfSpeech: wordSenses.partOfSpeech,
      definition: wordSenses.definition,
    })
    .from(userVocabulary)
    .innerJoin(words, eq(words.id, userVocabulary.wordId))
    .leftJoin(wordSenses, and(eq(wordSenses.wordId, words.id), eq(wordSenses.senseOrder, 0)))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(userVocabulary)
    .innerJoin(words, eq(words.id, userVocabulary.wordId))
    .where(whereClause)
    .get();

  return { items, total: totalRow?.count ?? 0, page, pageSize };
}

// ============================================================
// Word detail - everything the detail screen needs in one call.
// ============================================================

export function getWordDetail(db: Db, userId: string, userVocabularyId: string): WordDetail | null {
  const uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.id, userVocabularyId), eq(userVocabulary.userId, userId)))
    .get();
  if (!uv) return null;

  const wordRow = db.select().from(words).where(eq(words.id, uv.wordId)).get();
  if (!wordRow) return null;

  const senses = db
    .select({
      definition: wordSenses.definition,
      translation: wordSenses.translation,
      partOfSpeech: wordSenses.partOfSpeech,
      exampleSentence: wordSenses.exampleSentence,
      pronunciation: wordSenses.pronunciation,
      phonetic: wordSenses.phonetic,
      audioUrl: wordSenses.audioUrl,
    })
    .from(wordSenses)
    .where(eq(wordSenses.wordId, uv.wordId))
    .orderBy(asc(wordSenses.senseOrder))
    .all();

  const relations = db.select().from(wordRelations).where(eq(wordRelations.wordId, uv.wordId)).all();
  const relatedWordIds = relations.map((r) => r.relatedWordId);
  const relatedRows =
    relatedWordIds.length > 0
      ? db.select({ id: words.id, word: words.word }).from(words).where(inArray(words.id, relatedWordIds)).all()
      : [];
  const textById = new Map(relatedRows.map((w) => [w.id, w.word]));

  const byType = (type: "synonym" | "antonym" | "related") =>
    relations
      .filter((r) => r.relationType === type)
      .map((r) => textById.get(r.relatedWordId))
      .filter((w): w is string => Boolean(w));

  const collections = db
    .select({ id: vocabularyCollections.id, name: vocabularyCollections.name })
    .from(collectionWords)
    .innerJoin(vocabularyCollections, eq(vocabularyCollections.id, collectionWords.collectionId))
    .where(eq(collectionWords.userVocabularyId, userVocabularyId))
    .all();

  return {
    userVocabularyId: uv.id,
    wordId: wordRow.id,
    word: wordRow.word,
    difficultyLevel: wordRow.difficultyLevel,
    frequencyRank: wordRow.frequencyRank,
    status: uv.status,
    needsReview: uv.needsReview,
    masteryScore: uv.masteryScore,
    confidenceScore: uv.confidenceScore,
    knownBeforeApp: uv.knownBeforeApp,
    firstEncounteredAt: uv.firstEncounteredAt,
    learnedAt: uv.learnedAt,
    lastReviewedAt: uv.lastReviewedAt,
    nextReviewAt: uv.nextReviewAt,
    reviewCount: uv.reviewCount,
    correctCount: uv.correctCount,
    incorrectCount: uv.incorrectCount,
    senses,
    synonyms: byType("synonym"),
    antonyms: byType("antonym"),
    related: byType("related"),
    collections,
  };
}
