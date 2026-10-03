import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, drafts, invites, memberAddresses, users } from "../../src/lib/db/schema";
import { acceptInvite, createInvite } from "../../src/lib/auth/invites";
import { removeMember, setMemberAddresses } from "../../src/lib/auth/people";
import { loadViewer } from "../../src/lib/auth/viewer";
import { newUser } from "../helpers";

let ownerId: string;

beforeEach(async () => {
  await db.execute(sql`truncate table users, invites, addresses, drafts, member_addresses restart identity cascade`);
  ownerId = (await newUser("owner@example.test", "owner")).id;
});

describe("invites", () => {
  it("refuses an invite with no addresses", async () => {
    await expect(createInvite(ownerId, [])).rejects.toThrow();
  });

  it("grants exactly its addresses, lowercased, pinned and shown", async () => {
    await db.insert(addresses).values({ address: "alex@example.test", hidden: true });
    const token = await createInvite(ownerId, ["Alex@Example.test", " alex@example.test", "team@example.test"]);

    const user = await acceptInvite(token, "friend@example.test", "a good password");

    expect(user.role).toBe("member");
    const held = await db.select().from(memberAddresses).where(eq(memberAddresses.userId, user.id));
    expect(held.map((row) => row.address).sort()).toEqual(["alex@example.test", "team@example.test"]);
    const rows = await db.select().from(addresses);
    expect(rows.every((row) => row.pinned && !row.hidden)).toBe(true);
  });

  it("leaves nothing behind when accepting fails", async () => {
    const token = await createInvite(ownerId, ["alex@example.test"]);
    await expect(acceptInvite(token, "friend@example.test", "short")).rejects.toThrow();

    expect(await db.select().from(users).where(eq(users.email, "friend@example.test"))).toHaveLength(0);
    expect(await db.select().from(memberAddresses)).toHaveLength(0);
    const [invite] = await db.select().from(invites);
    expect(invite.acceptedAt).toBeNull();
  });

  it("leaves the invite open when the email is taken", async () => {
    const token = await createInvite(ownerId, ["alex@example.test"]);
    await expect(acceptInvite(token, "Owner@example.test", "a good password")).rejects.toThrow();

    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(memberAddresses)).toHaveLength(0);
    const [invite] = await db.select().from(invites);
    expect(invite.acceptedAt).toBeNull();
  });

  it("says the email is taken when another accept commits it first", async () => {
    const token = await createInvite(ownerId, ["alex@example.test"]);
    const other = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    let accepting!: Promise<unknown>;

    try {
      // The row is uncommitted, so the existence check misses it and the
      // insert waits on the unique index until this commits.
      await other.begin(async (tx) => {
        await tx`insert into users (email, password_hash, role) values ('friend@example.test', 'x', 'member')`;
        accepting = acceptInvite(token, "friend@example.test", "a good password");
        accepting.catch(() => {});
        await expect.poll(waitingOnLocks, { timeout: 10_000 }).toBeGreaterThan(0);
      });
    } finally {
      await other.end();
    }

    await expect(accepting).rejects.toThrow(/^An account with that email already exists\.$/);
    const [invite] = await db.select().from(invites);
    expect(invite.acceptedAt).toBeNull();
  });
});

async function waitingOnLocks() {
  const rows = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'`,
  );
  return rows[0].count;
}

describe("people", () => {
  async function member() {
    const token = await createInvite(ownerId, ["alex@example.test"]);
    return acceptInvite(token, "friend@example.test", "a good password");
  }

  it("applies an edit on the member's next request", async () => {
    const friend = await member();
    await setMemberAddresses(friend.id, ["Team@example.test"]);
    const viewer = await loadViewer(friend.id, undefined);
    expect(viewer?.allowed).toEqual({ kind: "addresses", list: ["team@example.test"] });
  });

  it("refuses an edit to no addresses, or on an owner", async () => {
    const friend = await member();
    await expect(setMemberAddresses(friend.id, [])).rejects.toThrow();
    await expect(setMemberAddresses(ownerId, ["alex@example.test"])).rejects.toThrow();
  });

  it("removes a member with their drafts, and never an owner", async () => {
    const friend = await member();
    await db.insert(drafts).values({ fromAddress: "alex@example.test", createdBy: friend.id });

    expect(await removeMember(ownerId)).toBe(false);
    expect(await removeMember(friend.id)).toBe(true);

    expect(await loadViewer(friend.id, undefined)).toBeNull();
    expect(await db.select().from(drafts)).toHaveLength(0);
    expect(await db.select().from(memberAddresses)).toHaveLength(0);
  });
});
