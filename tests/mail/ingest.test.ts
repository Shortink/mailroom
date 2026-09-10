import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, attachments, messages, threads } from "../../src/lib/db/schema";

const getReceivedEmail = vi.fn();
const getAttachment = vi.fn();
const downloadAttachment = vi.fn();

vi.mock("../../src/lib/mail/resend", () => ({
  getReceivedEmail: (id: string) => getReceivedEmail(id),
  getAttachment: (a: string, b: string) => getAttachment(a, b),
  downloadAttachment: (url: string) => downloadAttachment(url),
}));

const forwardCopy = vi.fn();
vi.mock("../../src/lib/mail/forward", () => ({
  forwardCopy: (id: string) => forwardCopy(id),
}));

const put = vi.fn();
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put, get: vi.fn(), delete: vi.fn(), url: (k: string) => `/a/${k}` }),
}));

const { completeIngest } = await import("../../src/lib/mail/ingest");

async function pending(resendId: string, overrides: Record<string, unknown> = {}) {
  const [thread] = await db.insert(threads).values({ subject: "" }).returning();
  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "pending",
      resendId,
      deliveredTo: "hi@example.test",
      ...overrides,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  getReceivedEmail.mockReset();
  getAttachment.mockReset();
  downloadAttachment.mockReset();
  put.mockReset();
  forwardCopy.mockReset();
  await db.execute(sql`truncate table messages, threads, addresses, attachments restart identity cascade`);
});

describe("completeIngest", () => {
  it("stores the body and marks the message complete", async () => {
    getReceivedEmail.mockResolvedValue({
      id: "r1",
      subject: "Invoice",
      text: "please pay",
      html: "<p>please pay</p>",
      from: "billing@vendor.test",
      to: ["hi@example.test"],
      message_id: "<a@vendor.test>",
      headers: { "received-spf": "pass" },
    });

    const row = await pending("r1");
    await completeIngest(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe("complete");
    expect(after.textBody).toBe("please pay");
    expect(after.messageId).toBe("<a@vendor.test>");
    expect(after.spf).toBe("pass");
  });

  it("registers the delivered address so it appears as an inbox", async () => {
    getReceivedEmail.mockResolvedValue({ id: "r2", subject: "Hi", received_for: ["billing@example.test"] });

    const row = await pending("r2");
    await completeIngest(row.id);

    const found = await db.select().from(addresses).where(eq(addresses.address, "billing@example.test"));
    expect(found).toHaveLength(1);
  });

  it("attaches to an existing thread by in-reply-to and drops the placeholder", async () => {
    const [existing] = await db
      .insert(threads)
      .values({ subject: "Invoice", participants: ["billing@vendor.test", "hi@example.test"] })
      .returning();
    await db.insert(messages).values({
      threadId: existing.id,
      direction: "inbound",
      status: "complete",
      messageId: "<original@vendor.test>",
    });

    getReceivedEmail.mockResolvedValue({
      id: "r3",
      subject: "Re: Invoice",
      from: "billing@vendor.test",
      headers: { "in-reply-to": "<original@vendor.test>" },
    });

    const row = await pending("r3");
    const placeholder = row.threadId;
    await completeIngest(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.threadId).toBe(existing.id);

    const orphans = await db.select().from(threads).where(eq(threads.id, placeholder));
    expect(orphans).toHaveLength(0);
  });

  // The delivered-to address is a participant on every thread, so it cannot be
  // the thing that proves a message belongs to one.
  it("refuses a stranger quoting a message id from someone else's thread", async () => {
    const [existing] = await db
      .insert(threads)
      .values({ subject: "Invoice", participants: ["billing@vendor.test", "hi@example.test"] })
      .returning();
    await db.insert(messages).values({
      threadId: existing.id,
      direction: "inbound",
      status: "complete",
      messageId: "<original@vendor.test>",
    });

    getReceivedEmail.mockResolvedValue({
      id: "r4",
      subject: "Re: Invoice",
      from: "stranger@evil.test",
      headers: { "in-reply-to": "<original@vendor.test>" },
    });

    const row = await pending("r4");
    await completeIngest(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.threadId).toBe(row.threadId);
    expect(after.threadId).not.toBe(existing.id);
  });

  it("attaches by subject and participant when headers are missing", async () => {
    const [existing] = await db
      .insert(threads)
      .values({ subject: "Quarterly report", participants: ["billing@vendor.test"] })
      .returning();

    getReceivedEmail.mockResolvedValue({
      id: "r4",
      subject: "Re: Quarterly report",
      from: "billing@vendor.test",
    });

    const row = await pending("r4");
    await completeIngest(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.threadId).toBe(existing.id);
  });

  it("downloads attachments and stores them through the driver", async () => {
    getReceivedEmail.mockResolvedValue({
      id: "r5",
      subject: "With file",
      attachments: [
        { id: "att-1", filename: "invoice.pdf", content_type: "application/pdf", size: 12, content_id: "cid-1" },
      ],
    });
    getAttachment.mockResolvedValue({ download_url: "https://cdn.test/f" });
    downloadAttachment.mockResolvedValue(Buffer.from("pdfbytes"));

    const row = await pending("r5");
    await completeIngest(row.id);

    const stored = await db.select().from(attachments).where(eq(attachments.messageId, row.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].filename).toBe("invoice.pdf");
    expect(stored[0].contentId).toBe("cid-1");
    expect(put).toHaveBeenCalledWith(`${row.id}/att-1`, Buffer.from("pdfbytes"), "application/pdf");
  });

  it("keeps the row pending and counts the attempt when the fetch fails", async () => {
    getReceivedEmail.mockRejectedValue(new Error("boom"));

    const row = await pending("r6");
    await expect(completeIngest(row.id)).rejects.toThrow("boom");

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);
  });

  it("gives up after five attempts", async () => {
    getReceivedEmail.mockRejectedValue(new Error("boom"));

    const row = await pending("r7", { attempts: 4 });
    await expect(completeIngest(row.id)).rejects.toThrow("boom");

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe("failed");
  });

  it("forwards a copy once the message is complete", async () => {
    getReceivedEmail.mockResolvedValue({ id: "r9", subject: "Hi" });

    const row = await pending("r9");
    await completeIngest(row.id);

    expect(forwardCopy).toHaveBeenCalledWith(row.id);
  });

  it("does nothing for a message already complete", async () => {
    const row = await pending("r8", { status: "complete" });
    await completeIngest(row.id);
    expect(getReceivedEmail).not.toHaveBeenCalled();
  });
});
