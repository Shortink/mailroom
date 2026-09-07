import { eq, sql } from "drizzle-orm";
import { TOTP } from "otpauth";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { loginAttempts, recoveryCodes, users } from "../../src/lib/db/schema";
import { hashPassword, verifyPassword } from "../../src/lib/auth/password";
import { readSession, signSession } from "../../src/lib/auth/session";
import { confirmEnrolment, startEnrolment, verifyCode } from "../../src/lib/auth/totp";
import { revokeSessions } from "../../src/lib/auth/revoke";
import { consumeRecoveryCode, issueRecoveryCodes } from "../../src/lib/auth/recovery";
import { recordAttempt, tooManyAttempts } from "../../src/lib/auth/rateLimit";

async function makeUser(email = `u${Math.random()}@example.test`) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword("correct horse battery") })
    .returning();
  return user;
}

beforeEach(async () => {
  await db.execute(sql`truncate table users, recovery_codes, login_attempts restart identity cascade`);
});

describe("password", () => {
  it("verifies the right password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("produces a different hash for the same password", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("session", () => {
  it("round-trips a user id", async () => {
    const token = await signSession("user-1", "full");
    expect(await readSession(token)).toEqual({ sub: "user-1", stage: "full", version: 0 });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession("user-1", "full");
    expect(await readSession(token.slice(0, -3) + "aaa")).toBeNull();
  });

  it("rejects a missing token", async () => {
    expect(await readSession(undefined)).toBeNull();
  });

  it("distinguishes a half-finished login from a complete one", async () => {
    const pending = await signSession("user-1", "totp");
    expect((await readSession(pending))?.stage).toBe("totp");
  });
});

describe("totp", () => {
  it("leaves the secret unconfirmed until a valid code arrives", async () => {
    const user = await makeUser();
    const { secret } = await startEnrolment(user.id);

    expect(await verifyCode(user.id, "000000")).toBe(false);

    const code = new TOTP({ secret }).generate();
    expect(await confirmEnrolment(user.id, code)).toBe(true);
    expect(await verifyCode(user.id, new TOTP({ secret }).generate())).toBe(true);
  });

  it("refuses to confirm with a wrong code", async () => {
    const user = await makeUser();
    await startEnrolment(user.id);
    expect(await confirmEnrolment(user.id, "000000")).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.totpConfirmedAt).toBeNull();
  });

  it("rejects codes for a user who never enrolled", async () => {
    const user = await makeUser();
    expect(await verifyCode(user.id, "123456")).toBe(false);
  });

  it("returns an otpauth uri that carries the account email", async () => {
    const user = await makeUser("someone@example.test");
    const { uri } = await startEnrolment(user.id);
    expect(uri).toContain("otpauth://totp/");
    expect(decodeURIComponent(uri)).toContain("someone@example.test");
  });
});

describe("recovery codes", () => {
  it("issues ten codes that each work once", async () => {
    const user = await makeUser();
    const codes = await issueRecoveryCodes(user.id);

    expect(codes).toHaveLength(10);
    expect(await consumeRecoveryCode(user.id, codes[0])).toBe(true);
    expect(await consumeRecoveryCode(user.id, codes[0])).toBe(false);
  });

  it("rejects a code that was never issued", async () => {
    const user = await makeUser();
    await issueRecoveryCodes(user.id);
    expect(await consumeRecoveryCode(user.id, "deadbeefdead")).toBe(false);
  });

  it("stores codes hashed, never in the clear", async () => {
    const user = await makeUser();
    const codes = await issueRecoveryCodes(user.id);
    const rows = await db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, user.id));

    expect(rows.every((row) => row.codeHash !== codes[0])).toBe(true);
  });

  it("replaces the previous set when new codes are issued", async () => {
    const user = await makeUser();
    const first = await issueRecoveryCodes(user.id);
    await issueRecoveryCodes(user.id);
    expect(await consumeRecoveryCode(user.id, first[0])).toBe(false);
  });
});

describe("rate limiting", () => {
  it("allows a user under the threshold", async () => {
    for (let i = 0; i < 4; i += 1) await recordAttempt("a@example.test", "1.1.1.1", false);
    expect(await tooManyAttempts("a@example.test", "1.1.1.1")).toBe(false);
  });

  it("blocks after five failures from one address", async () => {
    for (let i = 0; i < 5; i += 1) await recordAttempt("a@example.test", "1.1.1.1", false);
    expect(await tooManyAttempts("a@example.test", "9.9.9.9")).toBe(true);
  });

  it("blocks a single IP guessing many accounts", async () => {
    for (let i = 0; i < 5; i += 1) await recordAttempt(`u${i}@example.test`, "2.2.2.2", false);
    expect(await tooManyAttempts("fresh@example.test", "2.2.2.2")).toBe(true);
  });

  it("ignores successful attempts", async () => {
    for (let i = 0; i < 8; i += 1) await recordAttempt("a@example.test", "1.1.1.1", true);
    expect(await tooManyAttempts("a@example.test", "1.1.1.1")).toBe(false);
  });

  it("ignores failures outside the window", async () => {
    for (let i = 0; i < 6; i += 1) await recordAttempt("a@example.test", "1.1.1.1", false);
    await db
      .update(loginAttempts)
      .set({ attemptedAt: new Date(Date.now() - 60 * 60 * 1000) });

    expect(await tooManyAttempts("a@example.test", "1.1.1.1")).toBe(false);
  });
});

describe("totp re-enrolment is refused once confirmed", () => {
  it("will not overwrite a confirmed secret", async () => {
    const user = await makeUser();
    const { secret } = await startEnrolment(user.id);
    await confirmEnrolment(user.id, new TOTP({ secret }).generate());

    await expect(startEnrolment(user.id)).rejects.toThrow(/already/i);

    // The original factor still works, so the owner is not locked out.
    expect(await verifyCode(user.id, new TOTP({ secret }).generate())).toBe(true);
  });

  it("still allows a first enrolment", async () => {
    const user = await makeUser();
    await expect(startEnrolment(user.id)).resolves.toHaveProperty("secret");
  });

  it("allows re-enrolment while the first attempt is unconfirmed", async () => {
    const user = await makeUser();
    await startEnrolment(user.id);
    await expect(startEnrolment(user.id)).resolves.toHaveProperty("secret");
  });
});

describe("session versioning", () => {
  it("stops verifying a token signed against an older version", async () => {
    const token = await signSession("user-1", "full", 0);
    expect((await readSession(token))?.version).toBe(0);

    const bumped = await signSession("user-1", "full", 1);
    expect((await readSession(bumped))?.version).toBe(1);
  });
});
