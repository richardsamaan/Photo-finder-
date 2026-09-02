import { eq } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { languages } from "../../db/schema.js";

type Db = typeof RealDb;

export function getLanguageIdByCode(db: Db, code: string): string {
  const lang = db.select().from(languages).where(eq(languages.code, code)).get();
  if (!lang) throw new Error(`Language "${code}" is not seeded yet - run \`npm run db:seed\`.`);
  return lang.id;
}

export function getEnglishLanguageId(db: Db): string {
  return getLanguageIdByCode(db, "en");
}
