import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { recoveryCodes } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";

const COUNT = 10;

export const RECOVERY_COOKIE = "recovery";

// The codes exist in the clear only between being issued and being read on the
// page that shows them. Long enough to write them down, short enough not to sit
// in the browser afterwards.
export function recoveryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };
}

export async function issueRecoveryCodes(userId: string) {
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));

  const codes = Array.from({ length: COUNT }, () => randomBytes(5).toString("hex"));
  const rows = await Promise.all(
    codes.map(async (code) => ({ userId, codeHash: await hashPassword(code) })),
  );
  await db.insert(recoveryCodes).values(rows);

  return codes;
}

export async function consumeRecoveryCode(userId: string, code: string) {
  const unused = await db
    .select()
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));

  for (const row of unused) {
    if (!(await verifyPassword(row.codeHash, code))) continue;

    // Claiming in the WHERE clause means two concurrent submissions of the
    // same code cannot both succeed.
    const claimed = await db
      .update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(recoveryCodes.id, row.id), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });

    if (claimed.length > 0) return true;
  }

  return false;
}
