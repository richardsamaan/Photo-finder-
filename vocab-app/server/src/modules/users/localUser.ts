import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, userSettings } from "../../db/schema.js";

// Single-local-user mode (approved for now; Phase 3 adds real multi-user
// auth). Every personal table already keys off a real user_id, so
// swapping this constant for a session-resolved id later is additive -
// no schema change required.
export const LOCAL_USER_ID = "user_local";

// Idempotent: safe to call on every server start.
export function ensureLocalUser(): void {
  const existingUser = db.select().from(users).where(eq(users.id, LOCAL_USER_ID)).get();
  if (!existingUser) {
    db.insert(users).values({ id: LOCAL_USER_ID, name: "You" }).run();
  }

  const existingSettings = db.select().from(userSettings).where(eq(userSettings.userId, LOCAL_USER_ID)).get();
  if (!existingSettings) {
    db.insert(userSettings).values({ userId: LOCAL_USER_ID }).run();
  }
}
