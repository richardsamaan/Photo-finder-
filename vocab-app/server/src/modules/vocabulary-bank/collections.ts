import { and, asc, eq, sql } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { vocabularyCollections, collectionWords, userVocabulary } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";

type Db = typeof RealDb;

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  wordCount: number;
}

export function listCollections(db: Db, userId: string): CollectionSummary[] {
  return db
    .select({
      id: vocabularyCollections.id,
      name: vocabularyCollections.name,
      description: vocabularyCollections.description,
      wordCount: sql<number>`(SELECT COUNT(*) FROM collection_words WHERE collection_id = ${vocabularyCollections.id})`,
    })
    .from(vocabularyCollections)
    .where(eq(vocabularyCollections.userId, userId))
    .orderBy(asc(vocabularyCollections.name))
    .all();
}

function assertUniqueName(db: Db, userId: string, name: string, excludeCollectionId?: string): void {
  const existing = db
    .select()
    .from(vocabularyCollections)
    .where(and(eq(vocabularyCollections.userId, userId), eq(vocabularyCollections.name, name)))
    .get();
  if (existing && existing.id !== excludeCollectionId) {
    throw new Error(`A collection named "${name}" already exists.`);
  }
}

export function createCollection(db: Db, userId: string, name: string, description?: string): { id: string } {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Please enter a collection name.");
  assertUniqueName(db, userId, trimmedName);

  const id = newId("coll");
  db.insert(vocabularyCollections)
    .values({ id, userId, name: trimmedName, description: description?.trim() || null })
    .run();
  return { id };
}

function getOwnedCollection(db: Db, userId: string, collectionId: string) {
  const collection = db
    .select()
    .from(vocabularyCollections)
    .where(and(eq(vocabularyCollections.id, collectionId), eq(vocabularyCollections.userId, userId)))
    .get();
  if (!collection) throw new Error("Collection not found.");
  return collection;
}

export function updateCollection(
  db: Db,
  userId: string,
  collectionId: string,
  patch: { name?: string; description?: string }
): void {
  getOwnedCollection(db, userId, collectionId);

  const updates: { name?: string; description?: string | null; updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const trimmedName = patch.name.trim();
    if (!trimmedName) throw new Error("Please enter a collection name.");
    assertUniqueName(db, userId, trimmedName, collectionId);
    updates.name = trimmedName;
  }
  if (patch.description !== undefined) {
    updates.description = patch.description.trim() || null;
  }

  db.update(vocabularyCollections).set(updates).where(eq(vocabularyCollections.id, collectionId)).run();
}

export function deleteCollection(db: Db, userId: string, collectionId: string): void {
  getOwnedCollection(db, userId, collectionId);
  // collection_words rows cascade-delete via their FK - the vocabulary
  // words/user_vocabulary rows themselves are completely untouched.
  db.delete(vocabularyCollections).where(eq(vocabularyCollections.id, collectionId)).run();
}

export function addWordToCollection(db: Db, userId: string, collectionId: string, userVocabularyId: string): void {
  getOwnedCollection(db, userId, collectionId);

  const uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.id, userVocabularyId), eq(userVocabulary.userId, userId)))
    .get();
  if (!uv) throw new Error("Vocabulary word not found.");

  const existing = db
    .select()
    .from(collectionWords)
    .where(and(eq(collectionWords.collectionId, collectionId), eq(collectionWords.userVocabularyId, userVocabularyId)))
    .get();
  if (existing) return; // already in the collection - idempotent, no duplicate

  db.insert(collectionWords).values({ collectionId, userVocabularyId }).run();
}

export function removeWordFromCollection(db: Db, userId: string, collectionId: string, userVocabularyId: string): void {
  getOwnedCollection(db, userId, collectionId);
  db.delete(collectionWords)
    .where(and(eq(collectionWords.collectionId, collectionId), eq(collectionWords.userVocabularyId, userVocabularyId)))
    .run();
}
