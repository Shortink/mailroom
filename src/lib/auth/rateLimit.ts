import { and, eq, gt, or } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempts } from "../db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// What clientIp reports when no trusted proxy is supplying one.
export const UNKNOWN_IP = "direct";

// Counting by email and by IP together stops both a targeted attack on one
// account and one address spraying many accounts. With no proxy in front every
// caller shares UNKNOWN_IP, so counting that would lock out everyone.
export async function tooManyAttempts(identifier: string, ip: string) {
  const who =
    ip === UNKNOWN_IP
      ? eq(loginAttempts.identifier, identifier)
      : or(eq(loginAttempts.identifier, identifier), eq(loginAttempts.ip, ip))!;

  const recent = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(
      and(
        who,
        gt(loginAttempts.attemptedAt, new Date(Date.now() - WINDOW_MS)),
        eq(loginAttempts.succeeded, false),
      ),
    );

  return recent.length >= MAX_FAILURES;
}

export function recordAttempt(identifier: string, ip: string, succeeded: boolean) {
  return db.insert(loginAttempts).values({ identifier, ip, succeeded });
}
