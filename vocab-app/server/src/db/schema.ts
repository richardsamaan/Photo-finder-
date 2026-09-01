import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

// ============================================================
// Shared dictionary data - language-agnostic, identical for every user.
// See docs/database-architecture.md for why this is split from the
// user's personal learning state below.
// ============================================================

export const languages = sqliteTable("languages", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // ISO 639-1, e.g. "en", "fr", "es"
  name: text("name").notNull(), // English name, e.g. "English"
  nativeName: text("native_name").notNull(), // e.g. "English", "Français"
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const words = sqliteTable(
  "words",
  {
    id: text("id").primaryKey(),
    languageId: text("language_id").notNull(),
    word: text("word").notNull(), // original casing, e.g. "Bank"
    normalizedWord: text("normalized_word").notNull(), // lowercase/trimmed, for lookup + dedup
    frequencyRank: integer("frequency_rank"), // lower = more common; null if unknown
    difficultyLevel: text("difficulty_level", { enum: ["beginner", "intermediate", "advanced"] }),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    languageIdx: index("words_language_idx").on(t.languageId),
    normalizedIdx: index("words_normalized_idx").on(t.normalizedWord),
    uniqPerLanguage: uniqueIndex("words_language_normalized_unique").on(t.languageId, t.normalizedWord),
  })
);

// A word can have multiple meanings (e.g. "bank" = financial institution vs.
// riverbank) - each is its own row here, never collapsed onto `words`.
export const wordSenses = sqliteTable(
  "word_senses",
  {
    id: text("id").primaryKey(),
    wordId: text("word_id").notNull(),
    definition: text("definition").notNull(),
    translation: text("translation"), // populated once the learner's native language differs from the target language
    partOfSpeech: text("part_of_speech", {
      enum: [
        "noun",
        "verb",
        "adjective",
        "adverb",
        "pronoun",
        "preposition",
        "conjunction",
        "interjection",
        "determiner",
        "other",
      ],
    }).notNull(),
    exampleSentence: text("example_sentence"),
    pronunciation: text("pronunciation"), // simplified respelling, e.g. "uh-CHEEV"
    phonetic: text("phonetic"), // IPA, e.g. "/əˈtʃiːv/"
    audioUrl: text("audio_url"),
    senseOrder: integer("sense_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    wordIdx: index("word_senses_word_idx").on(t.wordId),
  })
);

// Minimal relation structure covering synonyms/antonyms/related words -
// one generic table rather than three, per the Phase 2 "don't over-engineer"
// instruction. Both sides reference real `words` rows, so relations stay
// query-able and referentially sound instead of loose text.
export const wordRelations = sqliteTable(
  "word_relations",
  {
    id: text("id").primaryKey(),
    wordId: text("word_id").notNull(),
    relatedWordId: text("related_word_id").notNull(),
    relationType: text("relation_type", { enum: ["synonym", "antonym", "related"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    wordIdx: index("word_relations_word_idx").on(t.wordId),
    uniqRelation: uniqueIndex("word_relations_unique").on(t.wordId, t.relatedWordId, t.relationType),
  })
);

// ============================================================
// Users - single local user for now (Phase 3 adds real auth), but every
// personal table below already keys off user_id so multi-user support
// later is additive, not a redesign.
// ============================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  dailyWordGoal: integer("daily_word_goal").notNull().default(10),
  dailyReviewGoal: integer("daily_review_goal").notNull().default(15),
  preferredLanguageId: text("preferred_language_id"),
  reminderTime: text("reminder_time"), // "HH:MM" local time, nullable
  difficultyPreference: text("difficulty_preference", { enum: ["easy", "balanced", "challenging"] })
    .notNull()
    .default("balanced"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

// ============================================================
// Personal vocabulary bank - the user's relationship with each word.
// Two users can point at the same `words` row while holding completely
// independent status/mastery/history here.
// ============================================================

export const userVocabulary = sqliteTable(
  "user_vocabulary",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    wordId: text("word_id").notNull(),
    status: text("status", { enum: ["new", "learning", "familiar", "mastered"] })
      .notNull()
      .default("new"),
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
    masteryScore: integer("mastery_score").notNull().default(0),
    confidenceScore: integer("confidence_score").notNull().default(0),
    // Mastered words are never deleted - archiving only removes them from
    // the active review queue while keeping full history intact.
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    firstEncounteredAt: text("first_encountered_at").notNull().default(sql`(current_timestamp)`),
    learnedAt: text("learned_at"),
    lastReviewedAt: text("last_reviewed_at"),
    nextReviewAt: text("next_review_at"),
    reviewCount: integer("review_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    consecutiveCorrect: integer("consecutive_correct").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    userIdx: index("user_vocabulary_user_idx").on(t.userId),
    wordIdx: index("user_vocabulary_word_idx").on(t.wordId),
    statusIdx: index("user_vocabulary_status_idx").on(t.status),
    nextReviewIdx: index("user_vocabulary_next_review_idx").on(t.nextReviewAt),
    uniqUserWord: uniqueIndex("user_vocabulary_user_word_unique").on(t.userId, t.wordId),
  })
);

// Every single review attempt, ever - never overwritten, so the mastery
// and spaced-repetition engines (later phases) have real history to learn
// from instead of just the latest result.
export const vocabularyReviewHistory = sqliteTable(
  "vocabulary_review_history",
  {
    id: text("id").primaryKey(),
    userVocabularyId: text("user_vocabulary_id").notNull(),
    testType: text("test_type", {
      enum: [
        "recognition",
        "recall",
        "multiple_choice",
        "fill_blank",
        "sentence_completion",
        "context_recognition",
        "spelling",
        "listening",
        "active_usage",
        "meaning_to_english",
      ],
    }).notNull(),
    result: text("result", { enum: ["correct", "incorrect", "partial"] }).notNull(),
    previousScore: integer("previous_score").notNull(),
    newScore: integer("new_score").notNull(),
    responseTimeMs: integer("response_time_ms"),
    reviewedAt: text("reviewed_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    userVocabIdx: index("review_history_user_vocab_idx").on(t.userVocabularyId),
    reviewedAtIdx: index("review_history_reviewed_at_idx").on(t.reviewedAt),
  })
);

// ============================================================
// Collections - user-organized groupings, independent of mastery state.
// ============================================================

export const vocabularyCollections = sqliteTable(
  "vocabulary_collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    userIdx: index("collections_user_idx").on(t.userId),
    uniqUserName: uniqueIndex("collections_user_name_unique").on(t.userId, t.name),
  })
);

// Many-to-many: a collection holds many words, a word can sit in many
// collections. Links to user_vocabulary (not the shared `words` table)
// since collections organize the user's own learning bank.
export const collectionWords = sqliteTable(
  "collection_words",
  {
    collectionId: text("collection_id").notNull(),
    userVocabularyId: text("user_vocabulary_id").notNull(),
    addedAt: text("added_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.userVocabularyId] }),
    userVocabIdx: index("collection_words_user_vocab_idx").on(t.userVocabularyId),
  })
);

// ============================================================
// Learning sessions - foundation only. The full daily-session engine
// (adaptive word counts, presentation order, etc.) is a later phase; this
// table just gives it somewhere to record start/finish and outcome counts.
// ============================================================

export const learningSessions = sqliteTable(
  "learning_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: text("started_at").notNull().default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
    newWordsCount: integer("new_words_count").notNull().default(0),
    reviewWordsCount: integer("review_words_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    durationSeconds: integer("duration_seconds"),
  },
  (t) => ({
    userIdx: index("learning_sessions_user_idx").on(t.userId),
  })
);
