import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export async function setupAvailable() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  return existing.length === 0;
}

// The guard is that only one row may exist at all, not that emails are unique.
// Putting "where not exists" in the statement makes the race a database
// concern, so two simultaneous submissions cannot both succeed.
export async function createFirstUser(email: string, password: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const hash = await hashPassword(password);
  const rows = await db.execute<{ id: string }>(sql`
    insert into users (email, password_hash)
    select ${email.trim().toLowerCase()}, ${hash}
    where not exists (select 1 from users)
    returning id
  `);

  if (rows.length === 0) throw new Error("Setup has already been completed.");
  return rows[0].id;
}
