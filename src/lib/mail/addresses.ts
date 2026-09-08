import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, messages, threads } from "../db/schema";

export interface AddressDetail {
  address: string;
  label: string | null;
  displayName: string | null;
  replyTo: string | null;
  hue: number | null;
  autoArchive: boolean;
  named: boolean;
  received: number;
  unread: number;
  sent: number;
  firstSeen: Date | null;
  lastActivity: Date | null;
}

export async function loadAddress(address: string): Promise<AddressDetail | null> {
  const [row] = await db.select().from(addresses).where(eq(addresses.address, address));
  if (!row) return null;

  const [stats] = await db
    .select({
      received: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.direction} = 'inbound')::int`,
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
      firstSeen: sql<string | null>`min(${messages.receivedAt})`,
      lastActivity: sql<string | null>`max(${messages.receivedAt})`,
    })
    .from(messages)
    .where(eq(messages.deliveredTo, address));

  return {
    address: row.address,
    label: row.label,
    displayName: row.displayName,
    replyTo: row.replyTo,
    hue: row.hue,
    autoArchive: row.autoArchive,
    named: row.pinned,
    received: stats?.received ?? 0,
    unread: stats?.unread ?? 0,
    sent: stats?.sent ?? 0,
    // Aggregates come back as strings rather than dates.
    firstSeen: stats?.firstSeen ? new Date(stats.firstSeen) : null,
    lastActivity: stats?.lastActivity ? new Date(stats.lastActivity) : null,
  };
}

export interface AddressPatch {
  label?: string | null;
  displayName?: string | null;
  replyTo?: string | null;
  hue?: number | null;
  autoArchive?: boolean;
  pinned?: boolean;
}

export async function updateAddress(address: string, patch: AddressPatch) {
  // An empty patch still has to create the row, and has nothing to set on it.
  if (Object.keys(patch).length === 0) {
    await db.insert(addresses).values({ address }).onConflictDoNothing();
    return;
  }

  await db
    .insert(addresses)
    .values({ address, ...patch })
    .onConflictDoUpdate({ target: addresses.address, set: patch });
}

// Identity used when sending: a display name turns the envelope into
// "Name <addr>", and a reply-to points answers somewhere else.
export async function sendingIdentity(address: string) {
  const [row] = await db
    .select({ displayName: addresses.displayName, replyTo: addresses.replyTo })
    .from(addresses)
    .where(eq(addresses.address, address));

  return {
    from: row?.displayName ? `${row.displayName} <${address}>` : address,
    replyTo: row?.replyTo ?? undefined,
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Threads whose address opted into auto-archive drop out of the inbox once
// they have been quiet for thirty days. Run from the reconcile sweep.
export async function archiveStaleThreads() {
  const opted = await db
    .select({ address: addresses.address })
    .from(addresses)
    .where(eq(addresses.autoArchive, true));

  if (opted.length === 0) return 0;

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  let archived = 0;

  for (const { address } of opted) {
    const stale = await db
      .selectDistinct({ id: threads.id })
      .from(threads)
      .innerJoin(messages, eq(messages.threadId, threads.id))
      .where(
        and(
          eq(threads.archived, false),
          eq(messages.deliveredTo, address),
          lt(threads.lastMessageAt, cutoff),
        ),
      );

    for (const { id } of stale) {
      await db.update(threads).set({ archived: true }).where(eq(threads.id, id));
      archived += 1;
    }
  }

  return archived;
}
