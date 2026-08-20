import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, messages, threads } from "../../src/lib/db/schema";

const sendEmail = vi.fn();
const getEmail = vi.fn();
vi.mock("../../src/lib/mail/resend", () => ({
  sendEmail: (input: unknown) => sendEmail(input),
  getEmail: (id: string) => getEmail(id),
}));

vi.mock("../../src/lib/mail/forward", () => ({ forwardCopy: vi.fn() }));

const { captureMessageId, sendNew, sendReply } = await import("../../src/lib/mail/send");

async function seedThread() {
  const [thread] = await db
    .insert(threads)
    .values({ subject: "Invoice", participants: ["billing@vendor.test"] })
    .returning();

  await db.insert(messages).values({
    threadId: thread.id,
    direction: "inbound",
    status: "complete",
    subject: "Invoice",
    fromAddress: "billing@vendor.test",
    deliveredTo: "hi@example.test",
    messageId: "<original@vendor.test>",
    references: ["<older@vendor.test>"],
  });

  return thread.id;
}

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ id: "sent-1" });
  getEmail.mockReset();
  await db.execute(sql`truncate table messages, threads, addresses restart identity cascade`);
});

describe("sendReply", () => {
  it("threads the outgoing message for the recipient", async () => {
    const threadId = await seedThread();

    await sendReply({
      threadId,
      from: "hi@example.test",
      to: ["billing@vendor.test"],
      subject: "Re: Invoice",
      text: "paid",
    });

    const sent = sendEmail.mock.calls[0][0] as { headers: Record<string, string> };
    expect(sent.headers["In-Reply-To"]).toBe("<original@vendor.test>");
    expect(sent.headers["References"]).toBe("<older@vendor.test> <original@vendor.test>");
  });

  it("stores the reply as pending, since Resend assigns the id later", async () => {
    const threadId = await seedThread();

    await sendReply({
      threadId, from: "hi@example.test", to: ["billing@vendor.test"],
      subject: "Re: Invoice", text: "paid",
    });

    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));
    expect(row.direction).toBe("outbound");
    expect(row.status).toBe("pending");
    expect(row.messageId).toBeNull();
    expect(row.threadId).toBe(threadId);
  });

  it("omits threading headers when no prior message has an id", async () => {
    const [thread] = await db.insert(threads).values({ subject: "New" }).returning();

    await sendReply({
      threadId: thread.id, from: "hi@example.test", to: ["x@vendor.test"],
      subject: "New", text: "hello",
    });

    const sent = sendEmail.mock.calls[0][0] as { headers: Record<string, string> };
    expect(sent.headers["In-Reply-To"]).toBeUndefined();
  });
});

describe("sendNew", () => {
  it("creates a thread and registers the sending address", async () => {
    await sendNew({
      from: "hi@example.test",
      to: ["dana@northbound.co"],
      subject: "September availability",
      text: "Do you have a week free?",
    });

    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));
    expect(row.direction).toBe("outbound");
    expect(row.status).toBe("pending");

    const [thread] = await db.select().from(threads).where(eq(threads.id, row.threadId));
    expect(thread.subject).toBe("September availability");

    const [addr] = await db.select().from(addresses).where(eq(addresses.address, "hi@example.test"));
    expect(addr.pinned).toBe(true);
  });
});

describe("captureMessageId", () => {
  it("records the id Resend assigned once delivered", async () => {
    const threadId = await seedThread();
    await sendReply({
      threadId, from: "hi@example.test", to: ["billing@vendor.test"],
      subject: "Re: Invoice", text: "paid",
    });
    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));

    getEmail.mockResolvedValue({ last_event: "delivered", message_id: "<abc@email.amazonses.com>" });
    await captureMessageId(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.messageId).toBe("<abc@email.amazonses.com>");
    expect(after.status).toBe("complete");
  });

  it("leaves a queued message pending so the sweep retries it", async () => {
    const threadId = await seedThread();
    await sendReply({
      threadId, from: "hi@example.test", to: ["billing@vendor.test"],
      subject: "Re: Invoice", text: "paid",
    });
    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));

    getEmail.mockResolvedValue({ last_event: "queued", message_id: null });
    await captureMessageId(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe("pending");
    expect(after.messageId).toBeNull();
    expect(after.attempts).toBe(1);
  });

  it("gives up after five attempts rather than retrying forever", async () => {
    const threadId = await seedThread();
    await sendReply({
      threadId, from: "hi@example.test", to: ["billing@vendor.test"],
      subject: "Re: Invoice", text: "paid",
    });
    await db.update(messages).set({ attempts: 4 }).where(eq(messages.resendId, "sent-1"));
    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));

    getEmail.mockResolvedValue({ last_event: "queued", message_id: null });
    await captureMessageId(row.id);

    const [after] = await db.select().from(messages).where(eq(messages.id, row.id));
    expect(after.status).toBe("failed");
  });

  it("does nothing for a message already complete", async () => {
    const threadId = await seedThread();
    await sendReply({
      threadId, from: "hi@example.test", to: ["billing@vendor.test"],
      subject: "Re: Invoice", text: "paid",
    });
    await db.update(messages).set({ status: "complete" }).where(eq(messages.resendId, "sent-1"));
    const [row] = await db.select().from(messages).where(eq(messages.resendId, "sent-1"));

    await captureMessageId(row.id);
    expect(getEmail).not.toHaveBeenCalled();
  });
});
