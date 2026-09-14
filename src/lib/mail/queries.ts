import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, attachments, messages, threads } from "../db/schema";
import { countDrafts } from "./drafts";

export interface ThreadSummary {
  id: string;
  subject: string;
  lastMessageAt: Date;
  messageCount: number;
  unread: number;
  from: string | null;
  fromName: string | null;
  snippet: string | null;
  deliveredTo: string | null;
  sentFrom: string | null;
  hasAttachment: boolean;
}

// Outbound messages hold their full content the moment they are sent, so
// "pending" on one only means Resend has not confirmed the id yet. Inbound
// stays gated on "complete", which is when it has been fetched.
const visible = or(eq(messages.status, "complete"), eq(messages.direction, "outbound"));

export type Box = "inbox" | "sent" | "archive";

export interface ListOptions {
  address?: string;
  box?: Box;
  unreadOnly?: boolean;
  limit?: number;
  before?: Date;
}

export interface ThreadPage {
  threads: ThreadSummary[];
  // Pass back as `before` to get the next page; null when this is the last.
  nextCursor: Date | null;
}

const PAGE_SIZE = 50;

// In Sent the address identifying a thread is the one it was sent from, not
// the one it was delivered to.
function addressMatch(box: Box, address: string) {
  return box === "sent" ? eq(messages.fromAddress, address) : eq(messages.deliveredTo, address);
}

// Which threads belong in this view, newest first, one page at a time. Kept
// separate from the hydration below so that only the page being shown pays for
// the joins and aggregates.
async function pageOfThreads(opts: ListOptions, box: Box, limit: number) {
  const where = [visible, eq(threads.archived, box === "archive")];

  if (box === "sent") where.push(eq(messages.direction, "outbound"));
  if (opts.address) where.push(addressMatch(box, opts.address));
  if (opts.before) where.push(lt(threads.lastMessageAt, opts.before));
  if (opts.unreadOnly) {
    where.push(
      sql`exists (
        select 1 from ${messages} unread
        where unread.thread_id = ${threads.id}
          and unread.read_at is null
          and unread.direction = 'inbound'
      )`,
    );
  }

  return db
    .selectDistinct({ id: threads.id, lastMessageAt: threads.lastMessageAt })
    .from(threads)
    .innerJoin(messages, eq(messages.threadId, threads.id))
    .where(and(...where))
    .orderBy(desc(threads.lastMessageAt))
    .limit(limit + 1);
}

export async function listThreads(opts: ListOptions): Promise<ThreadPage> {
  const box = opts.box ?? "inbox";
  const limit = opts.limit ?? PAGE_SIZE;

  // One row over the limit shows whether another page exists.
  const page = await pageOfThreads(opts, box, limit);
  const wanted = page.slice(0, limit);
  if (wanted.length === 0) return { threads: [], nextCursor: null };

  const rows = await db
    .select({
      id: threads.id,
      subject: threads.subject,
      lastMessageAt: threads.lastMessageAt,
      messageCount: threads.messageCount,
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.direction} = 'inbound')::int`,
      from: sql<string | null>`(array_agg(${messages.fromAddress} order by ${messages.receivedAt} desc))[1]`,
      fromName: sql<string | null>`(array_agg(${messages.fromName} order by ${messages.receivedAt} desc))[1]`,
      snippet: sql<string | null>`(array_agg(${messages.textBody} order by ${messages.receivedAt} desc))[1]`,
      deliveredTo: sql<string | null>`(array_agg(${messages.deliveredTo} order by ${messages.receivedAt} desc))[1]`,
      sentFrom: sql<string | null>`(array_agg(${messages.fromAddress}) filter (where ${messages.direction} = 'outbound'))[1]`,
      hasAttachment: sql<boolean>`bool_or(${attachments.id} is not null)`,
    })
    .from(threads)
    .innerJoin(messages, eq(messages.threadId, threads.id))
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .where(
      and(
        visible,
        inArray(
          threads.id,
          wanted.map((row) => row.id),
        ),
      ),
    )
    .groupBy(threads.id)
    .orderBy(desc(threads.lastMessageAt));

  return {
    threads: rows as ThreadSummary[],
    nextCursor: page.length > limit ? wanted[wanted.length - 1].lastMessageAt : null,
  };
}

// Explicit account registration: same pinned flag receiving already sets, but
// callable before any mail exists so an address can send immediately.
export async function registerAccount(address: string) {
  await db
    .insert(addresses)
    .values({ address, pinned: true })
    .onConflictDoUpdate({ target: addresses.address, set: { pinned: true } });
}

export interface Inbox {
  address: string;
  label: string | null;
  hue: number | null;
  unread: number;
}

export interface Rail {
  named: Inbox[];
  catchAll: Inbox[];
  unread: number;
  sent: number;
  drafts: number;
  archived: number;
}

export async function listInboxes(): Promise<Rail> {
  const rows = await db
    .select({
      address: addresses.address,
      label: addresses.label,
      hue: addresses.hue,
      pinned: addresses.pinned,
      unread: sql<number>`count(${messages.id}) filter (where ${messages.readAt} is null and ${messages.status} = 'complete')::int`,
    })
    .from(addresses)
    .leftJoin(messages, eq(messages.deliveredTo, addresses.address))
    .where(eq(addresses.hidden, false))
    .groupBy(addresses.address, addresses.label, addresses.hue, addresses.pinned)
    .orderBy(asc(addresses.address));

  const strip = ({ address, label, hue, unread }: (typeof rows)[number]) => ({
    address,
    label,
    hue,
    unread,
  });

  const [totals] = await db
    .select({
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.direction} = 'inbound')::int`,
      sent: sql<number>`count(distinct ${messages.threadId}) filter (where ${messages.direction} = 'outbound')::int`,
    })
    .from(messages)
    .where(visible);

  const [archived] = await db
    .select({ n: count() })
    .from(threads)
    .where(eq(threads.archived, true));

  const draftCount = await countDrafts();

  return {
    // Addresses the operator claimed; the rest arrived by catch-all and are
    // listed separately until they are named.
    named: rows.filter((row) => row.pinned).map(strip),
    catchAll: rows.filter((row) => !row.pinned).map(strip),
    unread: totals?.unread ?? 0,
    sent: totals?.sent ?? 0,
    drafts: draftCount,
    archived: archived?.n ?? 0,
  };
}

export async function loadThread(threadId: string) {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) return null;

  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), visible))
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

// One message's body and its attachments, for rendering it again with remote
// images.
export async function loadMessageHtml(messageId: string) {
  const [message] = await db
    .select({ htmlBody: messages.htmlBody })
    .from(messages)
    .where(and(eq(messages.id, messageId), visible));
  if (!message?.htmlBody) return null;

  const parts = await db
    .select({ contentId: attachments.contentId, storageKey: attachments.storageKey })
    .from(attachments)
    .where(eq(attachments.messageId, messageId));

  return { html: message.htmlBody, parts };
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

export async function setArchived(threadId: string, archived: boolean) {
  await db.update(threads).set({ archived }).where(eq(threads.id, threadId));
}

export async function countFailed() {
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.status, "failed"));
  return row?.n ?? 0;
}

export interface SearchScope {
  unread: boolean;
  recent: boolean;
  attachments: boolean;
}

export interface SearchRow {
  id: string;
  sender: string;
  subject: string;
  address: string | null;
  at: Date;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Search spans every address on the domain, catch-all included, and returns
// one row per thread rather than per matching message.
export async function searchThreads(query: string, scope: SearchScope): Promise<SearchRow[]> {
  const where = [visible, sql`${messages.search} @@ plainto_tsquery('english', ${query})`];

  if (scope.unread) where.push(and(isNull(messages.readAt), eq(messages.direction, "inbound"))!);
  if (scope.recent) where.push(gt(messages.receivedAt, new Date(Date.now() - THIRTY_DAYS_MS)));

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
      at: threads.lastMessageAt,
      sender: sql<string>`coalesce((array_agg(${messages.fromName} order by ${messages.receivedAt} desc))[1], (array_agg(${messages.fromAddress} order by ${messages.receivedAt} desc))[1], 'Unknown')`,
      address: sql<string | null>`(array_agg(${messages.deliveredTo} order by ${messages.receivedAt} desc))[1]`,
      hasAttachment: sql<boolean>`bool_or(${attachments.id} is not null)`,
    })
    .from(threads)
    .innerJoin(matched, eq(matched.threadId, threads.id))
    .innerJoin(messages, eq(messages.threadId, threads.id))
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .groupBy(threads.id)
    .orderBy(desc(threads.lastMessageAt))
    .limit(50);

  return rows
    .filter((row) => !scope.attachments || row.hasAttachment)
    .map(({ hasAttachment: _drop, ...row }) => row);
}
