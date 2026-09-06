import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";

const completeIngest = vi.fn();
vi.mock("../../src/lib/mail/ingest", () => ({
  completeIngest: (id: string) => completeIngest(id),
}));

const { POST } = await import("../../src/app/api/tasks/reconcile/route");

const STALE = new Date(Date.now() - 10 * 60 * 1000);
const FRESH = new Date();

function call(token?: string) {
  return POST(
    new Request("https://example.test/api/tasks/reconcile", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function seed(rows: { resendId: string; attempts?: number; lastAttemptAt?: Date; status?: "pending" | "complete" | "failed" }[]) {
  const [thread] = await db.insert(threads).values({ subject: "t" }).returning();
  await db.insert(messages).values(
    rows.map((row) => ({
      threadId: thread.id,
      direction: "inbound" as const,
      status: row.status ?? ("pending" as const),
      resendId: row.resendId,
      attempts: row.attempts ?? 0,
      lastAttemptAt: row.lastAttemptAt ?? STALE,
    })),
  );
}

beforeEach(async () => {
  completeIngest.mockReset();
  completeIngest.mockResolvedValue(undefined);
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
    expect(await response.json()).toEqual({ found: 2, retried: 2 });
    expect(completeIngest).toHaveBeenCalledTimes(2);
  });

  it("leaves recently attempted rows alone", async () => {
    await seed([{ resendId: "fresh", lastAttemptAt: FRESH }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0 });
    expect(completeIngest).not.toHaveBeenCalled();
  });

  it("skips rows that already exhausted their attempts", async () => {
    await seed([{ resendId: "spent", attempts: 5 }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0 });
  });

  it("ignores rows that are not pending", async () => {
    await seed([{ resendId: "done", status: "complete" }, { resendId: "dead", status: "failed" }]);

    expect(await (await call(process.env.RECONCILE_TOKEN)).json()).toEqual({ found: 0, retried: 0 });
  });

  it("keeps sweeping after one row throws", async () => {
    await seed([{ resendId: "a1" }, { resendId: "a2" }]);
    completeIngest.mockRejectedValueOnce(new Error("boom"));

    const body = await (await call(process.env.RECONCILE_TOKEN)).json();

    expect(completeIngest).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ found: 2, retried: 1 });
  });
});
