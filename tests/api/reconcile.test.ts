import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";
import { CLAIM_MS } from "../../src/lib/mail/limits";

const completeIngest = vi.fn();
vi.mock("../../src/lib/mail/ingest", () => ({
  completeIngest: (id: string) => completeIngest(id),
}));

const captureMessageId = vi.fn();
vi.mock("../../src/lib/mail/send", () => ({
  captureMessageId: (id: string) => captureMessageId(id),
}));

const { POST } = await import("../../src/app/api/tasks/reconcile/route");

// Tied to the claim window rather than a number of its own, so widening the
// window cannot stop these rows counting as abandoned.
const STALE = new Date(Date.now() - CLAIM_MS - 60 * 1000);
const FRESH = new Date();

function call(token?: string) {
  return POST(
    new Request("https://example.test/api/tasks/reconcile", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function seed(
  rows: {
    resendId: string;
    attempts?: number;
    lastAttemptAt?: Date | null;
    ingestedAt?: Date;
    status?: "pending" | "complete" | "failed";
  }[],
) {
  const [thread] = await db.insert(threads).values({ subject: "t" }).returning();
  await db.insert(messages).values(
    rows.map((row) => ({
      threadId: thread.id,
      direction: "inbound" as const,
      status: row.status ?? ("pending" as const),
      resendId: row.resendId,
      attempts: row.attempts ?? 0,
      lastAttemptAt: row.lastAttemptAt === null ? null : (row.lastAttemptAt ?? STALE),
      ingestedAt: row.ingestedAt ?? null,
    })),
  );
}

beforeEach(async () => {
  completeIngest.mockReset();
  completeIngest.mockResolvedValue(undefined);
  captureMessageId.mockReset();
  captureMessageId.mockResolvedValue(undefined);
  await db.execute(sql`truncate table messages, threads restart identity cascade`);
});

describe("reconcile", () => {
  it("rejects a missing token", async () => {
    expect((await call()).status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    expect((await call("nope")).status).toBe(401);
  });

  it("rejects a token of the wrong length without comparing", async () => {
    expect((await call("short")).status).toBe(401);
  });

  it("retries stale pending rows", async () => {
    await seed([{ resendId: "s1" }, { resendId: "s2" }]);

    const response = await call(process.env.RECONCILE_TOKEN);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ found: 2, retried: 2, archived: 0 });
    expect(completeIngest).toHaveBeenCalledTimes(2);
  });

  it("leaves recently attempted rows alone", async () => {
    await seed([{ resendId: "fresh", lastAttemptAt: FRESH }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0, archived: 0 });
    expect(completeIngest).not.toHaveBeenCalled();
  });

  it("skips rows that already exhausted their attempts", async () => {
    await seed([{ resendId: "spent", attempts: 5 }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0, archived: 0 });
  });

  it("ignores rows that are finished or spent", async () => {
    await seed([
      { resendId: "done", status: "complete", ingestedAt: new Date() },
      { resendId: "dead", status: "failed" },
    ]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0, archived: 0 });
  });

  // A complete message whose attachments or forwarded copy never landed is
  // still outstanding work.
  it("picks up a complete message that never finished ingesting", async () => {
    await seed([{ resendId: "half", status: "complete" }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 1, retried: 1, archived: 0 });
  });

  it("picks up a row that never got its first attempt", async () => {
    await seed([{ resendId: "untouched", lastAttemptAt: null }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 1, retried: 1, archived: 0 });
  });

  it("keeps sweeping after one row throws", async () => {
    await seed([{ resendId: "a1" }, { resendId: "a2" }]);
    completeIngest.mockRejectedValueOnce(new Error("boom"));

    const body = await (await call(process.env.RECONCILE_TOKEN)).json();

    expect(completeIngest).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ found: 2, retried: 1, archived: 0 });
  });
});

describe("reconcile dispatch", () => {
  it("captures message ids for outbound rows instead of re-ingesting them", async () => {
    const stale = new Date(Date.now() - CLAIM_MS - 60 * 1000);
    const [thread] = await db.insert(threads).values({ subject: "t" }).returning();
    await db.insert(messages).values({
      threadId: thread.id,
      direction: "outbound",
      status: "pending",
      resendId: "out-1",
      lastAttemptAt: stale,
    });

    await call(process.env.RECONCILE_TOKEN);

    expect(captureMessageId).toHaveBeenCalledTimes(1);
    expect(completeIngest).not.toHaveBeenCalled();
  });
});
