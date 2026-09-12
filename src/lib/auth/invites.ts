import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { invites, users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { createUser } from "./users";

const TTL_HOURS = 48;

// The token names its own row in front of the secret, so a lookup is one
// indexed read rather than a hash per open invite.
export async function createInvite(createdBy: string, ttlHours = TTL_HOURS) {
  const selector = randomBytes(8).toString("hex");
  const secret = randomBytes(24).toString("hex");

  await db.insert(invites).values({
    selector,
    tokenHash: await hashPassword(secret),
    createdBy,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });

  return `${selector}.${secret}`;
}

async function findOpenInvite(token: string) {
  const [selector, secret] = token.split(".");
  if (!selector || !secret) return null;

  const [row] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.selector, selector),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    );
  if (!row) return null;

  return (await verifyPassword(row.tokenHash, secret)) ? row : null;
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

  // Claim the invite before creating anything, so two concurrent submissions
  // cannot both turn one token into an account.
  const claimed = await db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
    .returning({ id: invites.id });

  if (claimed.length === 0) throw new Error("That invite is no longer valid.");

  try {
    return await createUser(email, password);
  } catch (error) {
    // Hand the invite back if the account could not be created.
    await db.update(invites).set({ acceptedAt: null }).where(eq(invites.id, invite.id));
    throw error;
  }
}
