import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, attachments, messages, threads } from "../db/schema";

export interface ThreadSummary {
  id: string;
  subject: string;
  lastMessageAt: Date;
  messageCount: number;
  unread: number;
  from: string | null;
  snippet: string | null;
  deliveredTo: string | null;
  hasAttachment: boolean;
}

export async function listThreads(opts: { address?: string; search?: string }) {
  const where = [eq(messages.status, "complete")];
  if (opts.address) where.push(eq(messages.deliveredTo, opts.address));
  if (opts.search) {
    where.push(sql`${messages.search} @@ plainto_tsquery('english', ${opts.search})`);
  }

  // A search matches one message, but a summary describes the whole thread, so
  // the CTE narrows to matching threads and the outer query joins all of their
  // messages back in.
  const matched = db.$with("matched").as(
    db
      .select({ threadId: messages.threadId })
      .from(messages)
      .where(and(...where))
      .groupBy(messages.threadId),
  );

  const rows = await db
    .with(matched)
    .select({
      id: threads.id,
      subject: threads.subject,
      lastMessageAt: threads.lastMessageAt,
      messageCount: threads.messageCount,
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.direction} = 'inbound')::int`,
      from: sql<string | null>`(array_agg(${messages.fromAddress} order by ${messages.receivedAt} desc))[1]`,
      snippet: sql<string | null>`(array_agg(${messages.textBody} order by ${messages.receivedAt} desc))[1]`,
      deliveredTo: sql<string | null>`(array_agg(${messages.deliveredTo} order by ${messages.receivedAt} desc))[1]`,
      hasAttachment: sql<boolean>`bool_or(${attachments.id} is not null)`,
    })
    .from(threads)
    .innerJoin(matched, eq(matched.threadId, threads.id))
    .innerJoin(messages, eq(messages.threadId, threads.id))
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .groupBy(threads.id)
    .orderBy(desc(threads.lastMessageAt));

  return rows as ThreadSummary[];
}

export interface Inbox {
  address: string;
  label: string | null;
  unread: number;
}

export async function listInboxes() {
  const rows = await db
    .select({
      address: addresses.address,
      label: addresses.label,
      pinned: addresses.pinned,
      unread: sql<number>`count(${messages.id}) filter (where ${messages.readAt} is null and ${messages.status} = 'complete')::int`,
    })
    .from(addresses)
    .leftJoin(messages, eq(messages.deliveredTo, addresses.address))
    .where(eq(addresses.hidden, false))
    .groupBy(addresses.address, addresses.label, addresses.pinned)
    .orderBy(asc(addresses.address));

  const pinned: Inbox[] = rows
    .filter((row) => row.pinned)
    .map(({ address, label, unread }) => ({ address, label, unread }));

  const [totals] = await db
    .select({
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.direction} = 'inbound')::int`,
    })
    .from(messages)
    .where(eq(messages.status, "complete"));

  return {
    pinned,
    otherCount: rows.length - pinned.length,
    total: rows.length,
    unread: totals?.unread ?? 0,
  };
}

export async function loadThread(threadId: string) {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) return null;

  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.status, "complete")))
    .orderBy(asc(messages.receivedAt));

  const files = await db
    .select()
    .from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .where(eq(messages.threadId, threadId));

  return {
    ...thread,
    messages: rows,
    attachments: files.map((row) => row.attachments),
  };
}

export async function markThreadRead(threadId: string) {
  const read = await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.threadId, threadId), isNull(messages.readAt)))
    .returning({ deliveredTo: messages.deliveredTo });

  // Opening a thread is the signal that its address is worth a sidebar slot.
  const opened = [...new Set(read.map((row) => row.deliveredTo).filter(Boolean))] as string[];
  for (const address of opened) {
    await db.update(addresses).set({ pinned: true }).where(eq(addresses.address, address));
  }
}

export async function countFailed() {
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.status, "failed"));
  return row?.n ?? 0;
}
