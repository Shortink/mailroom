import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, attachments, messages, threads } from "../../src/lib/db/schema";
import type { InboundMail } from "../../src/lib/mail/inbound";
import { newThread } from "../helpers";

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

const { completeIngest, ingestParsed } = await import("../../src/lib/mail/ingest");

async function pending(resendId: string, overrides: Partial<typeof messages.$inferInsert> = {}) {
  const deliveredTo = overrides.deliveredTo ?? "hi@example.test";
  const thread = await newThread(deliveredTo, { subject: "" });
  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "pending",
      resendId,
      ...overrides,
      deliveredTo,
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

    const row = await pending("r2", { deliveredTo: "billing@example.test" });
    await completeIngest(row.id);

    const found = await db.select().from(addresses).where(eq(addresses.address, "billing@example.test"));
    expect(found).toHaveLength(1);
  });

  it("attaches to an existing thread by in-reply-to and drops the placeholder", async () => {
    const existing = await newThread("hi@example.test", {
      subject: "Invoice",
      participants: ["billing@vendor.test", "hi@example.test"],
    });
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

  it("starts a thread of its own when the one it replies to is in Trash", async () => {
    const trashed = await newThread("hi@example.test", {
      subject: "Invoice",
      participants: ["billing@vendor.test", "hi@example.test"],
      trashedAt: new Date(),
    });
    await db.insert(messages).values({
      threadId: trashed.id,
      direction: "inbound",
      status: "complete",
      messageId: "<original@vendor.test>",
    });

    getReceivedEmail.mockResolvedValue({
      id: "r3t",
      subject: "Re: Invoice",
      from: "billing@vendor.test",
      headers: { "in-reply-to": "<original@vendor.test>" },
    });

    const row = await pending("r3t");
    await completeIngest(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.threadId).toBe(row.threadId);
  });

  // The delivered-to address is a participant on every thread, so it cannot be
  // the thing that proves a message belongs to one.
  it("refuses a stranger quoting a message id from someone else's thread", async () => {
    const existing = await newThread("hi@example.test", {
      subject: "Invoice",
      participants: ["billing@vendor.test", "hi@example.test"],
    });
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
    const existing = await newThread("hi@example.test", {
      subject: "Quarterly report",
      participants: ["billing@vendor.test"],
    });

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

  it("does nothing for a message already ingested", async () => {
    const row = await pending("r8", { status: "complete", ingestedAt: new Date() });
    await completeIngest(row.id);
    expect(getReceivedEmail).not.toHaveBeenCalled();
  });

  // A body that landed before the attachments failed leaves a complete message
  // the sweep is still responsible for.
  it("picks up a complete message whose ingest never finished", async () => {
    getReceivedEmail.mockResolvedValue({ id: "r7", subject: "Hi" });

    const row = await pending("r7", { status: "complete" });
    await completeIngest(row.id);

    expect(getReceivedEmail).toHaveBeenCalled();
  });

  it("stamps ingestedAt once the work behind the message is done", async () => {
    getReceivedEmail.mockResolvedValue({ id: "r6", subject: "Hi" });

    const row = await pending("r6");
    await completeIngest(row.id);

    const [done] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(done.ingestedAt).not.toBeNull();
  });

  it("files under the row's own address, not Resend's first received_for", async () => {
    const row = await pending("own-1", { deliveredTo: "billing@example.test" });
    getReceivedEmail.mockResolvedValue({
      id: "own-1",
      from: "s@vendor.test",
      to: ["hi@example.test"],
      received_for: ["hi@example.test", "billing@example.test"],
      subject: "Invoice",
      text: "x",
      headers: {},
    });

    await completeIngest(row.id);

    const [stored] = await db
      .select({ deliveredTo: messages.deliveredTo, address: threads.address })
      .from(messages)
      .innerJoin(threads, eq(threads.id, messages.threadId))
      .where(eq(messages.id, row.id));
    expect(stored).toEqual({ deliveredTo: "billing@example.test", address: "billing@example.test" });
  });
});

function parsed(overrides: Partial<InboundMail> = {}): InboundMail {
  return {
    headers: {},
    from: "sender@vendor.test",
    to: ["hi@example.test"],
    cc: [],
    receivedFor: "hi@example.test",
    subject: "Hello",
    text: "body",
    html: null,
    messageId: "<m1@vendor.test>",
    attachments: [],
    ...overrides,
  };
}

describe("ingestParsed by address", () => {
  it("lands a message to two addresses twice, once in each address's thread", async () => {
    await ingestParsed(parsed({ receivedFor: "hi@example.test" }));
    await ingestParsed(parsed({ receivedFor: "sales@example.test" }));
    await ingestParsed(parsed({ receivedFor: "hi@example.test" }));
    await ingestParsed(parsed({ receivedFor: "sales@example.test" }));

    const rows = await db
      .select({ deliveredTo: messages.deliveredTo, address: threads.address })
      .from(messages)
      .innerJoin(threads, eq(threads.id, messages.threadId))
      .orderBy(messages.deliveredTo);

    expect(rows).toEqual([
      { deliveredTo: "hi@example.test", address: "hi@example.test" },
      { deliveredTo: "sales@example.test", address: "sales@example.test" },
    ]);
  });

  it("keeps the outbound copy when mail to your own address comes back in", async () => {
    const thread = await newThread("you@example.test", { subject: "Note to self" });
    await db.insert(messages).values({
      threadId: thread.id,
      direction: "outbound",
      status: "complete",
      deliveredTo: "you@example.test",
      fromAddress: "you@example.test",
      messageId: "<self@example.test>",
    });

    await ingestParsed(
      parsed({ receivedFor: "you@example.test", from: "you@example.test", messageId: "<self@example.test>" }),
    );

    const rows = await db.select({ direction: messages.direction }).from(messages).orderBy(messages.direction);
    expect(rows.map((row) => row.direction)).toEqual(["inbound", "outbound"]);
  });

  it("files a mixed-case recipient under the lowercase address", async () => {
    await ingestParsed(parsed({ receivedFor: "Alex@Example.test" }));

    const [row] = await db
      .select({ deliveredTo: messages.deliveredTo, address: threads.address })
      .from(messages)
      .innerJoin(threads, eq(threads.id, messages.threadId));
    expect(row).toEqual({ deliveredTo: "alex@example.test", address: "alex@example.test" });

    const rows = await db.select({ address: addresses.address }).from(addresses);
    expect(rows.map((r) => r.address)).toContain("alex@example.test");
    expect(rows.map((r) => r.address)).not.toContain("Alex@Example.test");
  });

  it("never joins a reply to another address's thread", async () => {
    const original = await newThread("you@example.test", {
      subject: "Plans",
      participants: ["sender@vendor.test", "you@example.test"],
    });
    await db.insert(messages).values({
      threadId: original.id,
      direction: "inbound",
      status: "complete",
      deliveredTo: "you@example.test",
      fromAddress: "sender@vendor.test",
      messageId: "<orig@vendor.test>",
      subject: "Plans",
    });

    await ingestParsed(
      parsed({
        receivedFor: "alex@example.test",
        to: ["alex@example.test", "you@example.test"],
        subject: "Re: Plans",
        messageId: "<reply@vendor.test>",
        headers: { "in-reply-to": "<orig@vendor.test>", references: "<orig@vendor.test>" },
      }),
    );

    const [youThread] = await db.select().from(threads).where(eq(threads.id, original.id));
    expect(youThread.messageCount).toBe(0);
    const alex = await db.select().from(threads).where(eq(threads.address, "alex@example.test"));
    expect(alex).toHaveLength(1);
  });
});
