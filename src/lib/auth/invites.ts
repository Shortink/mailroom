import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { invites, users } from "../db/schema";
import { memberAddressList } from "../mail/limits";
import { hashPassword, verifyPassword } from "./password";
import { grantAddresses } from "./people";
import { Refusal } from "./refusal";
import { MIN_PASSWORD } from "./users";

const TTL_HOURS = 48;
const TAKEN = "An account with that email already exists.";

// drizzle wraps the driver's error, so the Postgres code sits on the cause.
function uniqueViolation(error: unknown) {
  return error instanceof Error && (error.cause as { code?: string } | undefined)?.code === "23505";
}

// The token names its own row in front of the secret, so a lookup is one
// indexed read rather than a hash per open invite.
export async function createInvite(createdBy: string, raw: string[], ttlHours = TTL_HOURS) {
  const list = memberAddressList.parse(raw);
  const selector = randomBytes(8).toString("hex");
  const secret = randomBytes(24).toString("hex");

  await db.insert(invites).values({
    selector,
    tokenHash: await hashPassword(secret),
    createdBy,
    addresses: list,
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
  if (!invite) throw new Refusal("That invite is no longer valid.");
  if (password.length < MIN_PASSWORD) {
    throw new Refusal(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const address = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  // Claimed, created and granted together, so a failure anywhere leaves the
  // invite open and no half-made member behind.
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(invites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .returning({ id: invites.id });
    if (claimed.length === 0) throw new Refusal("That invite is no longer valid.");

    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, address));
    if (existing) throw new Refusal(TAKEN);

    // A second accept for the same email can commit between that check and
    // this insert, and then the unique index is what says so.
    const [user] = await tx
      .insert(users)
      .values({ email: address, passwordHash, role: "member" })
      .returning()
      .catch((error: unknown) => {
        throw uniqueViolation(error) ? new Refusal(TAKEN) : error;
      });
    await grantAddresses(tx, user.id, invite.addresses);
    return user;
  });
}
