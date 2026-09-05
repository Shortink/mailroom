import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { messages, threads } from "../src/lib/db/schema";

let threadId: string;

beforeAll(async () => {
  const [t] = await db.insert(threads).values({ subject: "seed" }).returning();
  threadId = t.id;
});

describe("messages", () => {
  it("collapses duplicate resend_id inserts", async () => {
    const row = { threadId, resendId: "dup-1", direction: "inbound" as const };
    await db.insert(messages).values(row).onConflictDoNothing();
    await db.insert(messages).values(row).onConflictDoNothing();
    const found = await db.select().from(messages).where(eq(messages.resendId, "dup-1"));
    expect(found).toHaveLength(1);
  });

  it("allows many rows with a null resend_id", async () => {
    await db.insert(messages).values({ threadId, direction: "outbound" });
    await db.insert(messages).values({ threadId, direction: "outbound" });
    const found = await db.select().from(messages).where(eq(messages.direction, "outbound"));
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults new messages to pending", async () => {
    const [row] = await db.insert(messages)
      .values({ threadId, direction: "inbound", resendId: "status-1" })
      .returning();
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
  });

  it("indexes subject and body for full-text search", async () => {
    await db.insert(messages).values({
      threadId, direction: "inbound", resendId: "search-1",
      subject: "Quarterly invoice", textBody: "the amount due is enclosed",
    });
    const hits = await db.execute(
      "select id from messages where search @@ plainto_tsquery('english', 'invoice enclosed')",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("removes messages when their thread is deleted", async () => {
    const [t] = await db.insert(threads).values({ subject: "temp" }).returning();
    await db.insert(messages).values({ threadId: t.id, direction: "inbound", resendId: "cascade-1" });
    await db.delete(threads).where(eq(threads.id, t.id));
    const found = await db.select().from(messages).where(eq(messages.resendId, "cascade-1"));
    expect(found).toHaveLength(0);
  });
});
