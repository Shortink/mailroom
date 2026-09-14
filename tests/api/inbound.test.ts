import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { addresses, attachments, messages, threads } from "../../src/lib/db/schema";

const put = vi.fn();
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put, get: vi.fn(), delete: vi.fn(), url: (k: string) => `/a/${k}` }),
}));

const { POST } = await import("../../src/app/api/inbound/cloudflare/route");

const SECRET = "s".repeat(32);

const RAW = [
  "From: Billing <billing@vendor.test>",
  "To: hi@example.test",
  "Subject: Invoice",
  "Message-ID: <inv-1@vendor.test>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "please pay",
  "--b",
  "Content-Type: application/pdf",
  'Content-Disposition: attachment; filename="invoice.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0=",
  "--b--",
  "",
].join("\r\n");

function post(raw: string, options: { token?: string; to?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "message/rfc822" };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.to !== null) headers["x-envelope-to"] = options.to ?? "hi@example.test";

  return POST(new Request("https://example.test/api/inbound/cloudflare", { method: "POST", headers, body: raw }));
}

beforeEach(async () => {
  put.mockReset();
  process.env.INBOUND_SECRET = SECRET;
  await db.execute(sql`truncate table messages, threads, addresses, attachments restart identity cascade`);
});

describe("cloudflare inbound", () => {
  it("rejects a missing token", async () => {
    expect((await post(RAW)).status).toBe(401);
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  it("rejects a wrong token", async () => {
    expect((await post(RAW, { token: "nope" })).status).toBe(401);
  });

  it("is closed when no secret is configured", async () => {
    delete process.env.INBOUND_SECRET;
    expect((await post(RAW, { token: SECRET })).status).toBe(401);
  });

  it("needs the envelope recipient", async () => {
    expect((await post(RAW, { token: SECRET, to: null })).status).toBe(400);
  });

  it("stores the message complete, with its attachment, in one request", async () => {
    const response = await post(RAW, { token: SECRET });
    expect(response.status).toBe(200);

    const [row] = await db.select().from(messages);
    expect(row.status).toBe("complete");
    expect(row.direction).toBe("inbound");
    expect(row.fromAddress).toBe("billing@vendor.test");
    expect(row.deliveredTo).toBe("hi@example.test");
    expect(row.subject).toBe("Invoice");
    expect(row.textBody?.trim()).toBe("please pay");
    expect(row.messageId).toBe("<inv-1@vendor.test>");
    expect(row.ingestedAt).not.toBeNull();
    // Cloudflare forwards its own copy, so the app must never send one.
    expect(row.forwardedAt).not.toBeNull();

    const stored = await db.select().from(attachments).where(eq(attachments.messageId, row.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].filename).toBe("invoice.pdf");
    expect(put).toHaveBeenCalledWith(`${row.id}/part-0`, Buffer.from("%PDF-"), "application/pdf");

    expect(await db.select().from(addresses).where(eq(addresses.address, "hi@example.test"))).toHaveLength(1);
  });

  it("delivers the same message once across retries", async () => {
    await post(RAW, { token: SECRET });
    const again = await post(RAW, { token: SECRET });

    expect(again.status).toBe(200);
    expect(await db.select().from(messages)).toHaveLength(1);
    expect(await db.select().from(threads)).toHaveLength(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("replaces a row left by an attempt that never finished", async () => {
    const [thread] = await db.insert(threads).values({ subject: "Invoice" }).returning();
    await db.insert(messages).values({
      threadId: thread.id,
      direction: "inbound",
      status: "pending",
      messageId: "<inv-1@vendor.test>",
    });

    await post(RAW, { token: SECRET });

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("complete");
    expect(rows[0].ingestedAt).not.toBeNull();
  });

  it("leaves nothing behind when storage fails", async () => {
    put.mockRejectedValueOnce(new Error("disk full"));

    await expect(post(RAW, { token: SECRET })).rejects.toThrow("disk full");

    expect(await db.select().from(messages)).toHaveLength(0);
    expect(await db.select().from(threads)).toHaveLength(0);
  });
});
