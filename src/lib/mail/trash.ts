import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { attachments, messages, threads } from "../db/schema";
import { getStorage } from "../storage";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function setTrashed(threadId: string, trashed: boolean) {
  await db
    .update(threads)
    .set({ trashedAt: trashed ? new Date() : null })
    .where(eq(threads.id, threadId));
}

export async function deleteForever(threadId: string) {
  await purge([threadId]);
}

export async function emptyOldTrash() {
  const old = await db
    .select({ id: threads.id })
    .from(threads)
    .where(lt(threads.trashedAt, new Date(Date.now() - THIRTY_DAYS_MS)));

  await purge(old.map((row) => row.id));
  return old.length;
}

async function purge(threadIds: string[]) {
  if (threadIds.length === 0) return;

  // Deleting the thread takes its rows with it, but not the files in storage.
  // Files go first, so if one fails the thread is still here for the next sweep.
  const files = await db
    .select({ key: attachments.storageKey })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(and(inArray(threads.id, threadIds), isNotNull(threads.trashedAt)));

  const storage = getStorage();
  for (const file of files) await storage.delete(file.key);

  // Only a thread still in Trash goes, so a stale button cannot take out one
  // that was restored in another tab.
  await db
    .delete(threads)
    .where(and(inArray(threads.id, threadIds), isNotNull(threads.trashedAt)));
}
