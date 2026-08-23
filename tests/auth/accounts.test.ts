import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { invites, users } from "../../src/lib/db/schema";
import { createFirstUser, setupAvailable } from "../../src/lib/auth/setup";
import { acceptInvite, createInvite, inviteIsValid } from "../../src/lib/auth/invites";
import { createUser } from "../../src/lib/auth/users";
import { verifyPassword } from "../../src/lib/auth/password";

beforeEach(async () => {
  await db.execute(sql`truncate table users, invites, recovery_codes restart identity cascade`);
});

describe("first-run setup", () => {
  it("is available only while no user exists", async () => {
    expect(await setupAvailable()).toBe(true);

    await createFirstUser("first@example.test", "correct horse battery");

    expect(await setupAvailable()).toBe(false);
  });

  it("creates exactly one user when three requests race", async () => {
    const attempt = (n: number) =>
      createFirstUser(`race${n}@example.test`, "correct horse battery").catch(() => null);

    await Promise.all([attempt(1), attempt(2), attempt(3)]);

    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("refuses once setup is complete", async () => {
    await createFirstUser("first@example.test", "correct horse battery");
    await expect(createFirstUser("second@example.test", "another password")).rejects.toThrow(
      /already/i,
    );
  });

  it("stores the password hashed", async () => {
    await createFirstUser("first@example.test", "correct horse battery");
    const [user] = await db.select().from(users);

    expect(user.passwordHash).not.toContain("correct horse");
    expect(await verifyPassword(user.passwordHash, "correct horse battery")).toBe(true);
  });
});

describe("invites", () => {
  async function owner() {
    await createFirstUser("owner@example.test", "correct horse battery");
    const [user] = await db.select().from(users);
    return user.id;
  }

  it("issues a token that validates once and then does not", async () => {
    const token = await createInvite(await owner());

    expect(await inviteIsValid(token)).toBe(true);
    await acceptInvite(token, "second@example.test", "another good password");
    expect(await inviteIsValid(token)).toBe(false);
  });

  it("creates the invited user", async () => {
    const token = await createInvite(await owner());
    await acceptInvite(token, "second@example.test", "another good password");

    const [user] = await db.select().from(users).where(eq(users.email, "second@example.test"));
    expect(user).toBeDefined();
    expect(await verifyPassword(user.passwordHash, "another good password")).toBe(true);
  });

  it("stores the token hashed, never in the clear", async () => {
    const token = await createInvite(await owner());
    const [row] = await db.select().from(invites);
    expect(row.tokenHash).not.toBe(token);
  });

  it("rejects an expired invite", async () => {
    const token = await createInvite(await owner());
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await inviteIsValid(token)).toBe(false);
    await expect(acceptInvite(token, "late@example.test", "password here")).rejects.toThrow();
  });

  it("rejects a token that was never issued", async () => {
    await owner();
    expect(await inviteIsValid("not-a-real-token")).toBe(false);
  });

  it("refuses to reuse an email that already exists", async () => {
    const token = await createInvite(await owner());
    await expect(acceptInvite(token, "owner@example.test", "password here")).rejects.toThrow();
  });
});

describe("createUser", () => {
  it("normalises the email so login is not case sensitive", async () => {
    await createUser("Mixed@Example.Test", "correct horse battery");
    const [user] = await db.select().from(users);
    expect(user.email).toBe("mixed@example.test");
  });

  it("rejects a short password", async () => {
    await expect(createUser("a@example.test", "short")).rejects.toThrow(/8 characters/);
  });
});
