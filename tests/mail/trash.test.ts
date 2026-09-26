import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db/client";
import { attachments, messages, threads } from "../../src/lib/db/schema";
import { newThread } from "../helpers";

const remove = vi.fn();
vi.mock("../../src/lib/storage", () => ({
  getStorage: () => ({ put: vi.fn(), get: vi.fn(), delete: remove, url: (k: string) => `/a/${k}` }),
}));

const { listInboxes, listThreads, searchThreads } = await import("../../src/lib/mail/queries");
const { deleteForever, emptyOldTrash, setTrashed } = await import("../../src/lib/mail/trash");

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedThread(subject: string, opts: { archived?: boolean; trashedAt?: Date } = {}) {
  const thread = await newThread("hi@x.test", {
    subject,
    archived: opts.archived ?? false,
    trashedAt: opts.trashedAt ?? null,
  });

  const [message] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "complete",
      subject,
      deliveredTo: "hi@x.test",
      fromAddress: "someone@vendor.test",
      textBody: `about ${subject}`,
    })
    .returning();

  return { threadId: thread.id, messageId: message.id };
}

beforeEach(async () => {
  remove.mockReset();
  await db.execute(sql`truncate table messages, threads, addresses, attachments restart identity cascade`);
});

describe("Trash", () => {
  it("takes a thread out of every other box and shows it in Trash", async () => {
    const { threadId } = await seedThread("kept");
    const archived = await seedThread("archived", { archived: true });
    await setTrashed(threadId, true);
    await setTrashed(archived.threadId, true);

    expect((await listThreads({})).threads).toHaveLength(0);
    expect((await listThreads({ box: "archive" })).threads).toHaveLength(0);

    const trash = await listThreads({ box: "trash" });
    expect(trash.threads.map((row) => row.subject).sort()).toEqual(["archived", "kept"]);
  });

  it("puts a restored thread back where it was", async () => {
    const { threadId } = await seedThread("back", { archived: true });
    await setTrashed(threadId, true);
    await setTrashed(threadId, false);

    expect((await listThreads({ box: "archive" })).threads).toHaveLength(1);
    expect((await listThreads({ box: "trash" })).threads).toHaveLength(0);
  });

  it("leaves trashed mail out of the counts and search", async () => {
    await seedThread("invoice", { trashedAt: new Date() });

    const rail = await listInboxes();
    expect(rail.unread).toBe(0);
    expect(rail.catchAll[0].unread).toBe(0);
    expect(rail.trashed).toBe(1);

    const hits = await searchThreads("invoice", { unread: false, recent: false, attachments: false });
    expect(hits).toHaveLength(0);
  });
});

describe("emptyOldTrash", () => {
  it("deletes threads trashed over thirty days ago, with their files", async () => {
    const old = await seedThread("old", { trashedAt: new Date(Date.now() - 31 * DAY_MS) });
    const recent = await seedThread("recent", { trashedAt: new Date(Date.now() - 2 * DAY_MS) });
    await seedThread("inbox");

    await db.insert(attachments).values({
      messageId: old.messageId,
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 3,
      storageKey: `${old.messageId}/a`,
    });

    expect(await emptyOldTrash()).toBe(1);
    expect(remove).toHaveBeenCalledWith(`${old.messageId}/a`);

    const left = await db.select({ id: threads.id }).from(threads);
    expect(left).toHaveLength(2);
    expect(left.map((row) => row.id)).toContain(recent.threadId);

    expect(await db.select().from(messages).where(eq(messages.id, old.messageId))).toHaveLength(0);
    expect(await db.select().from(attachments)).toHaveLength(0);
  });

  it("keeps the thread when a file cannot be deleted, so the next sweep retries", async () => {
    const old = await seedThread("old", { trashedAt: new Date(Date.now() - 31 * DAY_MS) });
    await db.insert(attachments).values({
      messageId: old.messageId,
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 3,
      storageKey: `${old.messageId}/a`,
    });
    remove.mockRejectedValue(new Error("storage down"));

    await expect(emptyOldTrash()).rejects.toThrow("storage down");
    expect(await db.select().from(threads)).toHaveLength(1);
  });
});

describe("deleteForever", () => {
  it("deletes a thread in Trash straight away", async () => {
    const { threadId } = await seedThread("gone", { trashedAt: new Date() });
    await deleteForever(threadId);
    expect(await db.select().from(threads)).toHaveLength(0);
  });

  it("refuses a thread that is not in Trash", async () => {
    const { threadId } = await seedThread("safe");
    await deleteForever(threadId);
    expect(await db.select().from(threads)).toHaveLength(1);
  });
});
