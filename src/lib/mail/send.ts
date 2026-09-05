import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, messages, threads } from "../db/schema";
import { sendingIdentity } from "./addresses";
import { getEmail, sendEmail } from "./resend";

const MAX_ATTEMPTS = 5;

export interface Outgoing {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

export async function sendReply(input: Outgoing & { threadId: string }) {
  const [previous] = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, input.threadId))
    .orderBy(desc(messages.receivedAt))
    .limit(1);

  const priorId = previous?.messageId ?? null;
  const references = priorId ? [...(previous?.references ?? []), priorId] : [];

  const headers: Record<string, string> = {};
  if (priorId) {
    headers["In-Reply-To"] = priorId;
    headers["References"] = references.join(" ");
  }

  const messageId = await deliver(input, headers, {
    threadId: input.threadId,
    inReplyTo: priorId,
    references,
  });

  await db
    .update(threads)
    .set({ lastMessageAt: new Date() })
    .where(eq(threads.id, input.threadId));

  return messageId;
}

export async function sendNew(input: Outgoing) {
  const [thread] = await db
    .insert(threads)
    .values({
      subject: input.subject,
      participants: [input.from, ...input.to],
      messageCount: 1,
    })
    .returning();

  return deliver(input, {}, { threadId: thread.id, inReplyTo: null, references: [] });
}

async function deliver(
  input: Outgoing,
  headers: Record<string, string>,
  thread: { threadId: string; inReplyTo: string | null; references: string[] },
) {
  const identity = await sendingIdentity(input.from);

  const sent = await sendEmail({
    from: identity.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    replyTo: identity.replyTo,
    headers,
  });

  // Resend assigns the real Message-ID and only exposes it once the message is
  // delivered, so the row stays pending until captureMessageId fills it in.
  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.threadId,
      direction: "outbound",
      status: "pending",
      resendId: sent.id,
      subject: input.subject,
      textBody: input.text,
      fromAddress: input.from,
      deliveredTo: input.from,
      to: input.to,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
      readAt: new Date(),
    })
    .returning();

  await db
    .insert(addresses)
    .values({ address: input.from, pinned: true })
    .onConflictDoUpdate({ target: addresses.address, set: { pinned: true } });

  return row.id;
}

export async function captureMessageId(messageId: string) {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!row?.resendId || row.status !== "pending") return;

  await db
    .update(messages)
    .set({ attempts: row.attempts + 1, lastAttemptAt: new Date() })
    .where(eq(messages.id, messageId));

  const sent = await getEmail(row.resendId);

  if (!sent.message_id) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await db.update(messages).set({ status: "failed" }).where(eq(messages.id, messageId));
    }
    return;
  }

  await db
    .update(messages)
    .set({ messageId: sent.message_id, status: "complete" })
    .where(eq(messages.id, messageId));
}
