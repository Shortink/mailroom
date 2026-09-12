import { and, eq, isNull, lt, or } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { db } from "../db/client";
import { users } from "../db/schema";

const PERIOD = 30;

function totpFor(secret: string, email: string) {
  return new TOTP({
    issuer: "Mailroom",
    label: email,
    secret: Secret.fromBase32(secret),
    period: PERIOD,
  });
}

export class AlreadyEnrolled extends Error {
  constructor() {
    super("Two-factor is already set up for this account.");
  }
}

// Overwriting a confirmed secret would let anyone holding only the password
// replace the second factor with their own.
export async function startEnrolment(userId: string) {
  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (existing?.totpConfirmedAt) throw new AlreadyEnrolled();

  const secret = new Secret().base32;

  const [user] = await db
    .update(users)
    .set({ totpSecret: secret, totpConfirmedAt: null })
    .where(eq(users.id, userId))
    .returning();

  return { secret, uri: totpFor(secret, user.email).toString() };
}

// The secret is written before it is proven, so enrolment stays unconfirmed
// until a real code arrives. Abandoning enrolment cannot lock the account.
export async function confirmEnrolment(userId: string, code: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.totpSecret) return false;
  if (totpFor(user.totpSecret, user.email).validate({ token: code, window: 1 }) === null) {
    return false;
  }

  await db.update(users).set({ totpConfirmedAt: new Date() }).where(eq(users.id, userId));
  return true;
}

// validate returns how many steps away the match was, so the step it matched
// is the current one plus that offset.
function stepOf(delta: number) {
  return Math.floor(Date.now() / 1000 / PERIOD) + delta;
}

export async function verifyCode(userId: string, code: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.totpSecret || !user.totpConfirmedAt) return false;

  const delta = totpFor(user.totpSecret, user.email).validate({ token: code, window: 1 });
  if (delta === null) return false;

  // A code is good once. Claiming the step in the where clause settles the
  // race between two submissions of the same one.
  const step = stepOf(delta);
  const claimed = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.totpLastStep), lt(users.totpLastStep, step)),
      ),
    )
    .returning({ id: users.id });

  return claimed.length > 0;
}
