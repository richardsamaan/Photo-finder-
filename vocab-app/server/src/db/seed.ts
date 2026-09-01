import { and, eq } from "drizzle-orm";
import { db as realDb } from "./client.js";
import { languages, words, wordSenses, wordRelations, userSettings } from "./schema.js";
import { newId } from "../lib/ids.js";
import { ensureLocalUser, LOCAL_USER_ID } from "../modules/users/localUser.js";
import { ENGLISH_SEED_WORDS, ENGLISH_SEED_RELATIONS } from "./seed-data.js";

// Accepts any drizzle db instance (the real one, or an in-memory test db
// from testUtils.ts) so the exact same seed content and logic can be
// reused by tests instead of duplicating fixture data.
type Db = typeof realDb;

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

export function seedEnglishLanguage(db: Db): string {
  const existing = db.select().from(languages).where(eq(languages.code, "en")).get();
  if (existing) return existing.id;

  const id = newId("lang");
  db.insert(languages).values({ id, code: "en", name: "English", nativeName: "English" }).run();
  return id;
}

export function seedWords(db: Db, languageId: string): Map<string, string> {
  const idByNormalized = new Map<string, string>();

  for (const entry of ENGLISH_SEED_WORDS) {
    const normalized = normalize(entry.word);
    const existing = db
      .select()
      .from(words)
      .where(and(eq(words.languageId, languageId), eq(words.normalizedWord, normalized)))
      .get();

    if (existing) {
      idByNormalized.set(normalized, existing.id);
      continue;
    }

    const wordId = newId("word");
    db.insert(words)
      .values({
        id: wordId,
        languageId,
        word: entry.word,
        normalizedWord: normalized,
        frequencyRank: entry.frequencyRank,
        difficultyLevel: entry.difficultyLevel,
      })
      .run();

    entry.senses.forEach((sense, index) => {
      db.insert(wordSenses)
        .values({
          id: newId("sense"),
          wordId,
          definition: sense.definition,
          partOfSpeech: sense.partOfSpeech,
          exampleSentence: sense.exampleSentence,
          pronunciation: sense.pronunciation,
          phonetic: sense.phonetic,
          senseOrder: index,
        })
        .run();
    });

    idByNormalized.set(normalized, wordId);
  }

  return idByNormalized;
}

export function seedRelations(db: Db, idByNormalized: Map<string, string>): void {
  for (const rel of ENGLISH_SEED_RELATIONS) {
    const wordId = idByNormalized.get(normalize(rel.word));
    const relatedWordId = idByNormalized.get(normalize(rel.relatedWord));
    if (!wordId || !relatedWordId) continue;

    const existing = db
      .select()
      .from(wordRelations)
      .where(
        and(
          eq(wordRelations.wordId, wordId),
          eq(wordRelations.relatedWordId, relatedWordId),
          eq(wordRelations.relationType, rel.type)
        )
      )
      .get();
    if (existing) continue;

    db.insert(wordRelations).values({ id: newId("relation"), wordId, relatedWordId, relationType: rel.type }).run();
  }
}

export function seed(db: Db): void {
  ensureLocalUser();

  const languageId = seedEnglishLanguage(db);
  const idByNormalized = seedWords(db, languageId);
  seedRelations(db, idByNormalized);

  // Point the local user's default learning language at English now that
  // it definitely exists.
  db.update(userSettings).set({ preferredLanguageId: languageId }).where(eq(userSettings.userId, LOCAL_USER_ID)).run();

  console.log(`[vocab-app seed] English language ready, ${idByNormalized.size} words seeded/verified`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed(realDb);
  process.exit(0);
}
