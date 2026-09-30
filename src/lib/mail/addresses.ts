import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, messages, threads } from "../db/schema";
import { inReach, type Allowed } from "./reach";

export interface AddressDetail {
  address: string;
  label: string | null;
  displayName: string | null;
  replyTo: string | null;
  hue: number | null;
  autoArchive: boolean;
  named: boolean;
  hidden: boolean;
  received: number;
  unread: number;
  sent: number;
  firstSeen: Date | null;
  lastActivity: Date | null;
}

export async function loadAddress(allowed: Allowed, address: string): Promise<AddressDetail | null> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.address, address), inReach(addresses.address, allowed)));
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
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(eq(threads.address, address));

  return {
    address: row.address,
    label: row.label,
    displayName: row.displayName,
    replyTo: row.replyTo,
    hue: row.hue,
    autoArchive: row.autoArchive,
    named: row.pinned,
    hidden: row.hidden,
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
  hidden?: boolean;
}

export async function updateAddress(address: string, patch: AddressPatch) {
  // An empty patch still has to create the row, and has nothing to set on it.
  if (Object.keys(patch).length === 0) {
    await db.insert(addresses).values({ address }).onConflictDoNothing();
    return;
  }

  // Order only applies to pinned addresses, so one moved back to catch-all
  // comes back at the end rather than in its old slot.
  const set = patch.pinned === false ? { ...patch, position: null } : patch;

  await db
    .insert(addresses)
    .values({ address, ...set })
    .onConflictDoUpdate({ target: addresses.address, set });
}

export async function reorderAddresses(order: string[]) {
  await db.transaction(async (tx) => {
    for (const [position, address] of order.entries()) {
      await tx.update(addresses).set({ position }).where(eq(addresses.address, address));
    }
  });
}

export async function listHidden() {
  const rows = await db
    .select({ address: addresses.address })
    .from(addresses)
    .where(eq(addresses.hidden, true))
    .orderBy(asc(addresses.address));
  return rows.map((row) => row.address);
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
  const opted = db
    .select({ address: addresses.address })
    .from(addresses)
    .where(eq(addresses.autoArchive, true));

  const archived = await db
    .update(threads)
    .set({ archived: true })
    .where(
      and(
        eq(threads.archived, false),
        lt(threads.lastMessageAt, new Date(Date.now() - THIRTY_DAYS_MS)),
        inArray(threads.address, opted),
      ),
    )
    .returning({ id: threads.id });

  return archived.length;
}
