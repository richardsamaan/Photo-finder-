// Hand-written, idempotent SQL - the actual source of truth for the DB
// schema (mirrors schema.ts's Drizzle definitions for typed queries).
// Kept in its own side-effect-free module (no import of client.ts) so
// tests can apply the exact same DDL to an isolated in-memory database
// instead of duplicating it.
//
// Table order matters: every REFERENCES target must already exist.
export const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS languages (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    native_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,

  `CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY,
    language_id TEXT NOT NULL REFERENCES languages (id) ON DELETE RESTRICT,
    word TEXT NOT NULL,
    normalized_word TEXT NOT NULL,
    frequency_rank INTEGER,
    difficulty_level TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS words_language_idx ON words (language_id)`,
  `CREATE INDEX IF NOT EXISTS words_normalized_idx ON words (normalized_word)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS words_language_normalized_unique ON words (language_id, normalized_word)`,

  `CREATE TABLE IF NOT EXISTS word_senses (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL REFERENCES words (id) ON DELETE CASCADE,
    definition TEXT NOT NULL,
    translation TEXT,
    part_of_speech TEXT NOT NULL,
    example_sentence TEXT,
    pronunciation TEXT,
    phonetic TEXT,
    audio_url TEXT,
    sense_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS word_senses_word_idx ON word_senses (word_id)`,

  `CREATE TABLE IF NOT EXISTS word_relations (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL REFERENCES words (id) ON DELETE CASCADE,
    related_word_id TEXT NOT NULL REFERENCES words (id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS word_relations_word_idx ON word_relations (word_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS word_relations_unique ON word_relations (word_id, related_word_id, relation_type)`,

  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    daily_word_goal INTEGER NOT NULL DEFAULT 10,
    daily_review_goal INTEGER NOT NULL DEFAULT 15,
    preferred_language_id TEXT REFERENCES languages (id) ON DELETE SET NULL,
    reminder_time TEXT,
    difficulty_preference TEXT NOT NULL DEFAULT 'balanced',
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,

  `CREATE TABLE IF NOT EXISTS user_vocabulary (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    word_id TEXT NOT NULL REFERENCES words (id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'new',
    needs_review INTEGER NOT NULL DEFAULT 0,
    mastery_score INTEGER NOT NULL DEFAULT 0,
    confidence_score INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    known_before_app INTEGER NOT NULL DEFAULT 0,
    first_encountered_at TEXT NOT NULL DEFAULT (current_timestamp),
    learned_at TEXT,
    last_reviewed_at TEXT,
    next_review_at TEXT,
    review_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    consecutive_correct INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS user_vocabulary_user_idx ON user_vocabulary (user_id)`,
  `CREATE INDEX IF NOT EXISTS user_vocabulary_word_idx ON user_vocabulary (word_id)`,
  `CREATE INDEX IF NOT EXISTS user_vocabulary_status_idx ON user_vocabulary (status)`,
  `CREATE INDEX IF NOT EXISTS user_vocabulary_next_review_idx ON user_vocabulary (next_review_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_vocabulary_user_word_unique ON user_vocabulary (user_id, word_id)`,

  `CREATE TABLE IF NOT EXISTS assessment_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'in_progress',
    is_baseline INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (current_timestamp),
    completed_at TEXT,
    estimated_vocabulary_size INTEGER,
    estimated_level TEXT,
    confidence TEXT,
    known_word_count INTEGER,
    learning_word_count INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS assessment_sessions_user_idx ON assessment_sessions (user_id)`,

  `CREATE TABLE IF NOT EXISTS assessment_responses (
    id TEXT PRIMARY KEY,
    assessment_session_id TEXT NOT NULL REFERENCES assessment_sessions (id) ON DELETE CASCADE,
    word_id TEXT NOT NULL REFERENCES words (id) ON DELETE RESTRICT,
    difficulty_level TEXT NOT NULL,
    question_type TEXT NOT NULL DEFAULT 'multiple_choice',
    selected_option TEXT,
    correct_option TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    dont_know INTEGER NOT NULL DEFAULT 0,
    response_time_ms INTEGER,
    answered_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS assessment_responses_session_idx ON assessment_responses (assessment_session_id)`,
  `CREATE INDEX IF NOT EXISTS assessment_responses_word_idx ON assessment_responses (word_id)`,

  `CREATE TABLE IF NOT EXISTS vocabulary_review_history (
    id TEXT PRIMARY KEY,
    user_vocabulary_id TEXT NOT NULL REFERENCES user_vocabulary (id) ON DELETE CASCADE,
    test_type TEXT NOT NULL,
    result TEXT NOT NULL,
    previous_score INTEGER NOT NULL,
    new_score INTEGER NOT NULL,
    response_time_ms INTEGER,
    reviewed_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS review_history_user_vocab_idx ON vocabulary_review_history (user_vocabulary_id)`,
  `CREATE INDEX IF NOT EXISTS review_history_reviewed_at_idx ON vocabulary_review_history (reviewed_at)`,

  `CREATE TABLE IF NOT EXISTS vocabulary_collections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS collections_user_idx ON vocabulary_collections (user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS collections_user_name_unique ON vocabulary_collections (user_id, name)`,

  `CREATE TABLE IF NOT EXISTS collection_words (
    collection_id TEXT NOT NULL REFERENCES vocabulary_collections (id) ON DELETE CASCADE,
    user_vocabulary_id TEXT NOT NULL REFERENCES user_vocabulary (id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (current_timestamp),
    PRIMARY KEY (collection_id, user_vocabulary_id)
  )`,
  `CREATE INDEX IF NOT EXISTS collection_words_user_vocab_idx ON collection_words (user_vocabulary_id)`,

  `CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    started_at TEXT NOT NULL DEFAULT (current_timestamp),
    completed_at TEXT,
    new_words_count INTEGER NOT NULL DEFAULT 0,
    review_words_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS learning_sessions_user_idx ON learning_sessions (user_id)`,
];
