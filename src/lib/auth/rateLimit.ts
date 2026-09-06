import { and, eq, gt, or } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempts } from "../db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// Counting by email and by IP together stops both a targeted attack on one
// account and one address spraying many accounts.
export async function tooManyAttempts(identifier: string, ip: string) {
  const recent = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(
      and(
        or(eq(loginAttempts.identifier, identifier), eq(loginAttempts.ip, ip)),
        gt(loginAttempts.attemptedAt, new Date(Date.now() - WINDOW_MS)),
        eq(loginAttempts.succeeded, false),
      ),
    );

  return recent.length >= MAX_FAILURES;
}

export function recordAttempt(identifier: string, ip: string, succeeded: boolean) {
  return db.insert(loginAttempts).values({ identifier, ip, succeeded });
}
