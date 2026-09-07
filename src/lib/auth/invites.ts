import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { invites, users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { createUser } from "./users";

const TTL_HOURS = 48;

export async function createInvite(createdBy: string, ttlHours = TTL_HOURS) {
  const token = randomBytes(24).toString("hex");

  await db.insert(invites).values({
    tokenHash: await hashPassword(token),
    createdBy,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });

  return token;
}

async function findOpenInvite(token: string) {
  const open = await db
    .select()
    .from(invites)
    .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));

  for (const row of open) {
    if (await verifyPassword(row.tokenHash, token)) return row;
  }
  return null;
}

export async function inviteIsValid(token: string) {
  return (await findOpenInvite(token)) !== null;
}

export async function acceptInvite(token: string, email: string, password: string) {
  const invite = await findOpenInvite(token);
  if (!invite) throw new Error("That invite is no longer valid.");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (existing) throw new Error("An account with that email already exists.");

  const user = await createUser(email, password);
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

  return user;
}
