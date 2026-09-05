import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, messages, threads } from "../../src/lib/db/schema";
import {
  listInboxes,
  listThreads,
  loadThread,
  markThreadRead,
  registerAccount,
  searchThreads,
} from "../../src/lib/mail/queries";

async function seedThread(opts: {
  subject: string;
  at: string;
  deliveredTo: string;
  unread?: boolean;
  body?: string;
}) {
  const [thread] = await db
    .insert(threads)
    .values({ subject: opts.subject, lastMessageAt: new Date(opts.at) })
    .returning();

  await db.insert(messages).values({
    threadId: thread.id,
    direction: "inbound",
    status: "complete",
    subject: opts.subject,
    deliveredTo: opts.deliveredTo,
    fromAddress: "someone@vendor.test",
    textBody: opts.body ?? "body",
    receivedAt: new Date(opts.at),
    readAt: opts.unread ? null : new Date(),
  });

  await db.insert(addresses).values({ address: opts.deliveredTo }).onConflictDoNothing();
  return thread.id;
}

beforeEach(async () => {
  await db.execute(sql`truncate table messages, threads, addresses restart identity cascade`);
});

describe("listThreads", () => {
  it("orders by most recent first", async () => {
    await seedThread({ subject: "older", at: "2026-01-01", deliveredTo: "hi@x.test" });
    await seedThread({ subject: "newer", at: "2026-09-01", deliveredTo: "hi@x.test" });

    const rows = await listThreads({});
    expect(rows.map((r) => r.subject)).toEqual(["newer", "older"]);
  });

  it("filters to one address", async () => {
    await seedThread({ subject: "to hi", at: "2026-09-01", deliveredTo: "hi@x.test" });
    await seedThread({ subject: "to billing", at: "2026-09-02", deliveredTo: "billing@x.test" });

    const rows = await listThreads({ address: "billing@x.test" });
    expect(rows.map((r) => r.subject)).toEqual(["to billing"]);
  });

  it("returns each thread once even with many messages", async () => {
    const threadId = await seedThread({ subject: "busy", at: "2026-09-01", deliveredTo: "hi@x.test" });
    await db.insert(messages).values({
      threadId, direction: "outbound", status: "complete", subject: "busy", deliveredTo: "hi@x.test",
    });

    expect(await listThreads({})).toHaveLength(1);
  });

  it("finds threads by full-text search across every address", async () => {
    await seedThread({ subject: "Quarterly invoice", at: "2026-09-01", deliveredTo: "hi@x.test", body: "amount due enclosed" });
    await seedThread({ subject: "Lunch", at: "2026-09-02", deliveredTo: "hi@x.test", body: "thursday?" });

    const rows = await searchThreads("invoice enclosed", {
      unread: false,
      recent: false,
      attachments: false,
    });
    expect(rows.map((r) => r.subject)).toEqual(["Quarterly invoice"]);
  });

  it("reports unread counts per thread", async () => {
    await seedThread({ subject: "unread one", at: "2026-09-01", deliveredTo: "hi@x.test", unread: true });
    const [row] = await listThreads({});
    expect(row.unread).toBe(1);
  });
});

describe("listInboxes", () => {
  it("separates pinned addresses from the rest", async () => {
    await seedThread({ subject: "a", at: "2026-09-01", deliveredTo: "hi@x.test", unread: true });
    await seedThread({ subject: "b", at: "2026-09-02", deliveredTo: "spam@x.test" });
    await db.update(addresses).set({ pinned: true }).where(eq(addresses.address, "hi@x.test"));

    const { named, catchAll } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual(["hi@x.test"]);
    expect(named[0].unread).toBe(1);
    expect(catchAll.map((inbox) => inbox.address)).toEqual(["spam@x.test"]);
  });

  it("omits hidden addresses entirely", async () => {
    await seedThread({ subject: "a", at: "2026-09-01", deliveredTo: "junk@x.test" });
    await db.update(addresses).set({ hidden: true }).where(eq(addresses.address, "junk@x.test"));

    const { named, catchAll } = await listInboxes();
    expect(named).toHaveLength(0);
    expect(catchAll).toHaveLength(0);
  });
});

describe("registerAccount", () => {
  it("pins an address that never received mail", async () => {
    await registerAccount("me@x.test");

    const { named } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual(["me@x.test"]);
  });

  it("pins an address that already exists without erasing its history", async () => {
    await seedThread({ subject: "a", at: "2026-09-01", deliveredTo: "hi@x.test", unread: true });

    await registerAccount("hi@x.test");

    const { named } = await listInboxes();
    expect(named.map((inbox) => inbox.address)).toEqual(["hi@x.test"]);
    expect(named[0].unread).toBe(1);
  });
});

describe("loadThread", () => {
  it("returns messages oldest first", async () => {
    const threadId = await seedThread({ subject: "chat", at: "2026-09-01", deliveredTo: "hi@x.test" });
    await db.insert(messages).values({
      threadId, direction: "outbound", status: "complete", subject: "chat",
      textBody: "second", receivedAt: new Date("2026-09-02"),
    });

    const thread = await loadThread(threadId);
    expect(thread?.messages.map((m) => m.textBody)).toEqual(["body", "second"]);
  });

  it("returns null for an unknown thread", async () => {
    expect(await loadThread("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("hides messages that never completed", async () => {
    const threadId = await seedThread({ subject: "chat", at: "2026-09-01", deliveredTo: "hi@x.test" });
    await db.insert(messages).values({
      threadId, direction: "inbound", status: "pending", resendId: "still-fetching",
    });

    const thread = await loadThread(threadId);
    expect(thread?.messages).toHaveLength(1);
  });
});

describe("markThreadRead", () => {
  it("stamps unread messages and pins the address", async () => {
    const threadId = await seedThread({ subject: "a", at: "2026-09-01", deliveredTo: "hi@x.test", unread: true });

    await markThreadRead(threadId);

    const [msg] = await db.select().from(messages).where(eq(messages.threadId, threadId));
    expect(msg.readAt).not.toBeNull();

    const [addr] = await db.select().from(addresses).where(eq(addresses.address, "hi@x.test"));
    expect(addr.pinned).toBe(true);
  });

  it("does not disturb messages already read", async () => {
    const threadId = await seedThread({ subject: "a", at: "2026-09-01", deliveredTo: "hi@x.test" });
    const [before] = await db.select().from(messages).where(eq(messages.threadId, threadId));

    await markThreadRead(threadId);

    const [after] = await db.select().from(messages).where(eq(messages.threadId, threadId));
    expect(after.readAt?.getTime()).toBe(before.readAt?.getTime());
  });
});
