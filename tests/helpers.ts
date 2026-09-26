import { db } from "../src/lib/db/client";
import { addresses, threads, users } from "../src/lib/db/schema";

// A thread's address must exist first, the same order every real path follows.
export async function newThread(
  address: string,
  values: Omit<typeof threads.$inferInsert, "address"> = {},
) {
  await db.insert(addresses).values({ address }).onConflictDoNothing();
  const [thread] = await db
    .insert(threads)
    .values({ address, ...values })
    .returning();
  return thread;
}

export async function newUser(email = "owner@example.test", role: "owner" | "member" = "owner") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash", role })
    .returning();
  return user;
}
