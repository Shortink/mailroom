import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";
import { mailArrived, onMailArrived } from "../../src/lib/mail/events";

const getReceivedEmail = vi.fn();
vi.mock("../../src/lib/mail/resend", () => ({
  getReceivedEmail: (id: string) => getReceivedEmail(id),
  getAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

vi.mock("../../src/lib/mail/forward", () => ({ forwardCopy: vi.fn() }));
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn(), url: (k: string) => `/a/${k}` }),
}));

const { completeIngest } = await import("../../src/lib/mail/ingest");

beforeEach(async () => {
  await db.execute(
    sql`truncate table messages, threads, attachments, addresses restart identity cascade`,
  );
  getReceivedEmail.mockReset();
});

describe("mail events", () => {
  it("reaches every listener and stops after unsubscribing", () => {
    const seen: string[] = [];
    const stop = onMailArrived(() => seen.push("a"));
    const stopB = onMailArrived(() => seen.push("b"));

    mailArrived();
    expect(seen).toEqual(["a", "b"]);

    stop();
    mailArrived();
    expect(seen).toEqual(["a", "b", "b"]);

    stopB();
  });

  it("fires once ingest has made a message visible", async () => {
    const [thread] = await db.insert(threads).values({ subject: "" }).returning();
    const [row] = await db
      .insert(messages)
      .values({ threadId: thread.id, direction: "inbound", status: "pending", resendId: "re_1" })
      .returning();

    getReceivedEmail.mockResolvedValue({
      id: "re_1",
      from: "someone@vendor.test",
      to: ["hi@x.test"],
      received_for: ["hi@x.test"],
      subject: "hello",
      text: "body",
      headers: {},
    });

    const arrivals: number[] = [];
    const stop = onMailArrived(() => arrivals.push(1));

    await completeIngest(row.id);
    stop();

    expect(arrivals).toHaveLength(1);
  });

  it("stays quiet when ingest could not fetch the message", async () => {
    const [thread] = await db.insert(threads).values({ subject: "" }).returning();
    const [row] = await db
      .insert(messages)
      .values({ threadId: thread.id, direction: "inbound", status: "pending", resendId: "re_2" })
      .returning();

    getReceivedEmail.mockRejectedValue(new Error("resend is down"));

    const arrivals: number[] = [];
    const stop = onMailArrived(() => arrivals.push(1));

    await completeIngest(row.id).catch(() => {});
    stop();

    expect(arrivals).toHaveLength(0);
  });
});
