import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { imageSenders, users } from "../db/schema";
import type { Verdict } from "./auth";

// Resend can hand the sender over as "Name <address>", so the allowance is
// kept and matched on the bare address alone.
export function senderOf(from: string | null) {
  if (!from) return null;
  const bare = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  return bare.includes("@") ? bare : null;
}

export async function allowSender(from: string) {
  const address = senderOf(from);
  if (!address) return;
  await db.insert(imageSenders).values({ address }).onConflictDoNothing();
}

export async function disallowSender(from: string) {
  const address = senderOf(from);
  if (!address) return;
  await db.delete(imageSenders).where(eq(imageSenders.address, address));
}

export async function listAllowedSenders() {
  const rows = await db
    .select({ address: imageSenders.address })
    .from(imageSenders)
    .orderBy(asc(imageSenders.address));
  return rows.map((row) => row.address);
}

export async function loadsImages(userId: string) {
  const [row] = await db
    .select({ on: users.loadImages })
    .from(users)
    .where(eq(users.id, userId));
  return row?.on ?? false;
}

export async function setLoadsImages(userId: string, on: boolean) {
  await db.update(users).set({ loadImages: on }).where(eq(users.id, userId));
}

export type ImageRule = "all" | "sender" | null;

export interface ImageMessage {
  direction: string;
  fromAddress: string | null;
  verdict: Verdict;
}

// Anyone can fake a From line, so mail that failed authentication stays blocked
// whatever the settings say.
export async function imageRules(
  messages: ImageMessage[],
  loadAll: boolean,
): Promise<ImageRule[]> {
  const senders = [...new Set(messages.map((m) => senderOf(m.fromAddress)).filter(Boolean))];

  const allowed = senders.length
    ? await db
        .select({ address: imageSenders.address })
        .from(imageSenders)
        .where(inArray(imageSenders.address, senders as string[]))
    : [];
  const allowedSet = new Set(allowed.map((row) => row.address));

  return messages.map((message) => {
    if (message.direction !== "inbound" || message.verdict === "fail") return null;
    if (loadAll) return "all";
    const sender = senderOf(message.fromAddress);
    return sender && allowedSet.has(sender) ? "sender" : null;
  });
}
