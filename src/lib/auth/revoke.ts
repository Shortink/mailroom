import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

// Sessions are stateless, so the only way to end one early is to move the
// version the token was signed against.
export async function revokeSessions(userId: string) {
  const [user] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });

  return user?.sessionVersion ?? 0;
}

export async function currentVersion(userId: string) {
  const [user] = await db
    .select({ sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId));
  return user?.sessionVersion ?? null;
}
