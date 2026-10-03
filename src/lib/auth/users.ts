import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export const MIN_PASSWORD = 8;

export async function createUser(email: string, password: string, role: "owner" | "member") {
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const [user] = await db
    .insert(users)
    .values({ email: email.trim().toLowerCase(), passwordHash: await hashPassword(password), role })
    .returning();

  return user;
}

export async function findUser(id: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
  return user ?? null;
}
