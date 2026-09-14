import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { attachments, messages, threads } from "../../src/lib/db/schema";
import { signAttachmentUrl } from "../../src/lib/mail/attachmentLink";

const currentUser = vi.fn();
vi.mock("../../src/lib/auth/require", () => ({
  currentUser: () => currentUser(),
}));

const get = vi.fn();
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put: vi.fn(), get, delete: vi.fn(), url: (k: string) => `/api/attachments/${encodeURIComponent(k)}` }),
}));

const { GET } = await import("../../src/app/api/attachments/[key]/route");

const KEY = "msg/part-0";

function fetchKey(query = "") {
  const request = new Request(`https://example.test/api/attachments/${encodeURIComponent(KEY)}${query}`);
  return GET(request, { params: Promise.resolve({ key: encodeURIComponent(KEY) }) });
}

beforeEach(async () => {
  currentUser.mockReset();
  currentUser.mockResolvedValue(null);
  get.mockReset();
  get.mockResolvedValue(Buffer.from("%PDF-"));

  await db.execute(sql`truncate table messages, threads, attachments restart identity cascade`);
  const [thread] = await db.insert(threads).values({ subject: "t" }).returning();
  const [message] = await db
    .insert(messages)
    .values({ threadId: thread.id, direction: "inbound", status: "complete" })
    .returning();
  await db.insert(attachments).values({
    messageId: message.id,
    filename: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 5,
    storageKey: KEY,
  });
});

describe("attachment route", () => {
  it("refuses a request with neither a session nor a signature", async () => {
    expect((await fetchKey()).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves to a session", async () => {
    currentUser.mockResolvedValue("user-1");
    const response = await fetchKey();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("%PDF-"));
  });

  // The sandboxed frame that shows the message body has no cookie to send.
  it("serves to a signed link without a session", async () => {
    const query = signAttachmentUrl("", KEY);
    expect((await fetchKey(query)).status).toBe(200);
  });

  it("refuses a signature for a different key", async () => {
    const query = signAttachmentUrl("", "msg/part-1");
    expect((await fetchKey(query)).status).toBe(401);
  });

  it("refuses a tampered signature", async () => {
    const query = signAttachmentUrl("", KEY).replace(/sig=./, "sig=0");
    expect((await fetchKey(query)).status).toBe(401);
  });
});
