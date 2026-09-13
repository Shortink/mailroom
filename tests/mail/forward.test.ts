import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { messages, threads } from "../../src/lib/db/schema";

const sendEmail = vi.fn();
vi.mock("../../src/lib/mail/resend", () => ({
  sendEmail: (input: unknown) => sendEmail(input),
}));

const { forwardCopy } = await import("../../src/lib/mail/forward");

async function seed(overrides: Record<string, unknown> = {}) {
  const [thread] = await db.insert(threads).values({ subject: "Invoice" }).returning();
  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "complete",
      subject: "Invoice",
      fromAddress: "billing@vendor.test",
      deliveredTo: "hi@example.test",
      textBody: "please pay",
      ...overrides,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ id: "fwd-1" });
  process.env.FORWARD_TO = "phone@gmail.test";
  await db.execute(sql`truncate table messages, threads restart identity cascade`);
});

describe("forwardCopy", () => {
  it("sends to the configured inbox with the original sender and subject", async () => {
    const row = await seed();
    await forwardCopy(row.id);

    const sent = sendEmail.mock.calls[0][0] as {
      to: string[];
      subject: string;
      text: string;
      headers: Record<string, string>;
    };

    expect(sent.to).toEqual(["phone@gmail.test"]);
    expect(sent.subject).toContain("Invoice");
    expect(sent.text).toContain("billing@vendor.test");
    expect(sent.text).toContain("please pay");
  });

  it("marks the copy so it is not ingested again", async () => {
    const row = await seed();
    await forwardCopy(row.id);

    const { forwardMarker } = await import("../../src/lib/mail/marker");
    const sent = sendEmail.mock.calls[0][0] as { headers: Record<string, string> };
    expect(sent.headers["X-Forwarded-By"]).toBe(forwardMarker());
    expect(sent.headers["X-Forwarded-By"]).not.toBe("resend-mail-client");
  });

  it("does nothing when no forwarding address is configured", async () => {
    delete process.env.FORWARD_TO;
    const row = await seed();

    await forwardCopy(row.id);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("swallows send failures so ingest still succeeds", async () => {
    sendEmail.mockRejectedValue(new Error("boom"));
    const row = await seed();

    await expect(forwardCopy(row.id)).resolves.toBeUndefined();
  });

  // The steps after this one can be retried, so the claim is what stops a
  // second copy going out.
  it("sends one copy however many times it is called", async () => {
    const row = await seed();

    await forwardCopy(row.id);
    await forwardCopy(row.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("hands the claim back when the send fails, so the sweep tries again", async () => {
    sendEmail.mockRejectedValueOnce(new Error("boom"));
    const row = await seed();

    await forwardCopy(row.id);
    await forwardCopy(row.id);

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("ignores an unknown message id", async () => {
    await expect(forwardCopy("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("forwards outbound mail too, so the phone sees whole conversations", async () => {
    const row = await seed({ direction: "outbound", fromAddress: "hi@example.test" });
    await forwardCopy(row.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
