import { and, eq, ne, sql } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { words, wordSenses } from "../../db/schema.js";
import type { SessionQuestion, SessionQuestionOption, SessionTestType } from "./sessionTypes.js";

type Db = typeof RealDb;

export interface PrimarySenseInfo {
  definition: string;
  partOfSpeech: string;
  exampleSentence: string | null;
  phonetic: string | null;
  pronunciation: string | null;
}

export interface BlankInfo {
  token: string; // the exact original word form found in the sentence (may be inflected)
  blanked: string; // the sentence with that token replaced by a blank
}

// Finds the first token in `sentence` whose letters (ignoring leading/
// trailing punctuation) contain `normalizedWord` as a substring - this
// tolerates common inflections ("achieved", "running") since they
// contain their base form as a prefix. Pure and independently testable.
export function findBlankToken(sentence: string, normalizedWord: string): BlankInfo | null {
  const pieces = sentence.split(/(\s+)/); // keep whitespace as its own entries for easy reassembly
  const needle = normalizedWord.toLowerCase();

  for (let i = 0; i < pieces.length; i++) {
    const raw = pieces[i];
    if (/^\s*$/.test(raw)) continue;
    const stripped = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!stripped) continue;
    if (stripped.toLowerCase().includes(needle)) {
      const blankedPieces = [...pieces];
      blankedPieces[i] = raw.replace(stripped, "_____");
      return { token: stripped, blanked: blankedPieces.join("") };
    }
  }
  return null;
}

// Deterministic, seeded shuffle - NOT Math.random(). Seeding on the session
// id means repeated GETs of the same current question (page reload, the
// resume case) return byte-identical option order/distractors, satisfying
// getCurrentQuestion's "safe to call repeatedly without side effects"
// contract; seeding also on the word means a *different* session still
// reshuffles, so the correct answer's position isn't memorizable session to
// session.
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return (h >>> 0) || 1;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = hashSeed(seed);
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getWordRow(db: Db, wordId: string) {
  return db.select().from(words).where(eq(words.id, wordId)).get();
}

export function getPrimarySense(db: Db, wordId: string): PrimarySenseInfo | null {
  const sense = db
    .select({
      definition: wordSenses.definition,
      partOfSpeech: wordSenses.partOfSpeech,
      exampleSentence: wordSenses.exampleSentence,
      phonetic: wordSenses.phonetic,
      pronunciation: wordSenses.pronunciation,
    })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, wordId), eq(wordSenses.senseOrder, 0)))
    .get();
  return sense ?? null;
}

interface DistractorWord {
  id: string;
  word: string;
  definition: string;
}

function getDistractorPool(db: Db, languageId: string, excludeWordId: string, limit = 40): DistractorWord[] {
  return db
    .select({ id: words.id, word: words.word, definition: wordSenses.definition })
    .from(words)
    .innerJoin(wordSenses, and(eq(wordSenses.wordId, words.id), eq(wordSenses.senseOrder, 0)))
    .where(and(eq(words.languageId, languageId), ne(words.id, excludeWordId)))
    .limit(limit)
    .all();
}

export interface EligibilityContext {
  sense: PrimarySenseInfo | null;
  blankInfo: BlankInfo | null;
  distractorCount: number;
}

// A test type needs at least a primary sense/definition to exist at all;
// beyond that, multiple_choice additionally needs 3+ distractors and
// fill_blank needs a locatable token in the example sentence.
export function isEligibleTestType(testType: SessionTestType, ctx: EligibilityContext): boolean {
  if (!ctx.sense) return false;
  switch (testType) {
    case "multiple_choice":
      return ctx.distractorCount >= 3;
    case "fill_blank":
      return ctx.blankInfo !== null;
    default:
      return true;
  }
}

const OPTION_KEYS: SessionQuestionOption["key"][] = ["A", "B", "C", "D"];

// Builds the question payload for a specific word + test type from live
// dictionary data - never a cached/stale copy. Returns null if this word
// isn't actually eligible for the requested test type (caller should have
// checked eligibility first via the queue-building step, but this stays
// safe to call standalone too, e.g. for GET .../current on resume).
// `seed` (the owning session's id) keeps multiple_choice's shuffle
// deterministic across repeated calls within the same session - see
// seededShuffle's comment above.
export function buildQuestion(
  db: Db,
  userVocabularyId: string,
  wordId: string,
  testType: SessionTestType,
  seed: string
): SessionQuestion | null {
  const wordRow = getWordRow(db, wordId);
  if (!wordRow) return null;

  const sense = getPrimarySense(db, wordId);
  if (!sense) return null;

  const base = {
    userVocabularyId,
    wordId: wordRow.id,
    testType,
    phonetic: sense.phonetic,
  };

  switch (testType) {
    case "multiple_choice": {
      const pool = getDistractorPool(db, wordRow.languageId, wordRow.id);
      if (pool.length < 3) return null;
      const distractors = seededShuffle(pool, `${seed}:${wordRow.id}:distractors`).slice(0, 3);
      const optionTexts = seededShuffle([sense.definition, ...distractors.map((d) => d.definition)], `${seed}:${wordRow.id}:options`);
      const options: SessionQuestionOption[] = optionTexts.map((text, i) => ({ key: OPTION_KEYS[i], text }));
      // Safe to include the word here: the definition (not the word) is
      // what's being tested, and the word is already given in the prompt.
      return { ...base, word: wordRow.word, prompt: `What does "${wordRow.word}" mean?`, options };
    }
    case "english_to_meaning":
      // Same reasoning - the word is given, the user produces its meaning.
      return { ...base, word: wordRow.word, prompt: `What does "${wordRow.word}" mean? Type your answer in your own words.` };
    case "meaning_to_english":
      // The word itself is the answer here - never include it in the payload.
      return { ...base, prompt: `Which word means: "${sense.definition}"?` };
    case "spelling":
      // Same - spelling the word out IS the answer.
      return { ...base, prompt: `Spell the word that means: "${sense.definition}"` };
    case "fill_blank": {
      if (!sense.exampleSentence) return null;
      const blank = findBlankToken(sense.exampleSentence, wordRow.normalizedWord);
      if (!blank) return null;
      // The blanked token is the answer - the sentence already shows
      // everything else; the word itself must stay out of the payload.
      return { ...base, prompt: "Fill in the blank.", sentence: blank.blanked };
    }
    default:
      return null;
  }
}

// Recomputes the same grading context buildQuestion used, for the
// /answer route to grade against - always fresh from the database, never
// trusting anything the client says about the question it was shown.
export interface GradingContext {
  word: string;
  normalizedWord: string;
  correctDefinition: string;
  blankedToken: string | null;
}

export function getGradingContext(db: Db, wordId: string): GradingContext | null {
  const wordRow = getWordRow(db, wordId);
  if (!wordRow) return null;
  const sense = getPrimarySense(db, wordId);
  if (!sense) return null;

  const blank = sense.exampleSentence ? findBlankToken(sense.exampleSentence, wordRow.normalizedWord) : null;

  return {
    word: wordRow.word,
    normalizedWord: wordRow.normalizedWord,
    correctDefinition: sense.definition,
    blankedToken: blank?.token ?? null,
  };
}

export function countDistractors(db: Db, languageId: string, excludeWordId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(words)
    .innerJoin(wordSenses, and(eq(wordSenses.wordId, words.id), eq(wordSenses.senseOrder, 0)))
    .where(and(eq(words.languageId, languageId), ne(words.id, excludeWordId)))
    .get();
  return row?.count ?? 0;
}
