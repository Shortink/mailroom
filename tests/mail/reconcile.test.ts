import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";

const completeIngest = vi.fn();
vi.mock("../../src/lib/mail/ingest", () => ({
  completeIngest: (id: string) => completeIngest(id),
}));

vi.mock("../../src/lib/mail/send", () => ({ captureMessageId: vi.fn() }));

const { retryFailed } = await import("../../src/lib/mail/reconcile");

beforeEach(async () => {
  await db.execute(sql`truncate table messages, threads restart identity cascade`);
  completeIngest.mockReset();
});

async function failedMessage() {
  const [thread] = await db.insert(threads).values({ subject: "t" }).returning();
  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "failed",
      attempts: 5,
      resendId: `re_${Math.random()}`,
    })
    .returning();
  return row.id;
}

describe("retryFailed", () => {
  it("puts a given-up message back in the queue and refetches it", async () => {
    const id = await failedMessage();
    completeIngest.mockImplementation(async (messageId: string) => {
      await db.update(messages).set({ status: "complete" }).where(eq(messages.id, messageId));
    });

    const result = await retryFailed();

    expect(result).toEqual({ attempted: 1, recovered: 1 });
    const [row] = await db.select().from(messages).where(eq(messages.id, id));
    expect(row.status).toBe("complete");
    expect(row.attempts).toBe(0);
  });

  it("counts nothing when there is nothing to retry", async () => {
    expect(await retryFailed()).toEqual({ attempted: 0, recovered: 0 });
    expect(completeIngest).not.toHaveBeenCalled();
  });

  it("leaves the message pending when the refetch fails again", async () => {
    const id = await failedMessage();
    completeIngest.mockRejectedValue(new Error("still down"));

    const result = await retryFailed();

    expect(result).toEqual({ attempted: 1, recovered: 0 });
    const [row] = await db.select().from(messages).where(eq(messages.id, id));
    expect(row.status).toBe("pending");
  });
});
