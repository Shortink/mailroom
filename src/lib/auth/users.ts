import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

const MIN_PASSWORD = 8;

export async function createUser(email: string, password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const [user] = await db
    .insert(users)
    .values({ email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) })
    .returning();

  return user;
}
