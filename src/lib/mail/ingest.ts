import { eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, attachments, messages, threads } from "../db/schema";
import { getStorage } from "../storage";
import { forwardCopy } from "./forward";
import { downloadAttachment, getAttachment, getReceivedEmail } from "./resend";
import { normalizeSubject, resolveThread, type Incoming } from "./threading";

const MAX_ATTEMPTS = 5;
const SUBJECT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 200;

export async function completeIngest(messageId: string) {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!row || row.status === "complete" || !row.resendId) return;

  await db
    .update(messages)
    .set({ attempts: row.attempts + 1, lastAttemptAt: new Date() })
    .where(eq(messages.id, messageId));

  try {
    const mail = await getReceivedEmail(row.resendId);
    const headers = mail.headers ?? {};
    const references = (headers["references"] ?? "").split(/\s+/).filter(Boolean);
    const inReplyTo = headers["in-reply-to"] ?? null;
    const subject = mail.subject ?? row.subject;
    const deliveredTo = mail.received_for?.[0] ?? row.deliveredTo;
    const fromAddress = mail.from ?? row.fromAddress;

    const participants = [fromAddress, deliveredTo, ...(mail.to ?? [])].filter(
      (address): address is string => Boolean(address),
    );

    const threadId = await resolveAndAttach({
      incoming: { inReplyTo, references, subject, participants, receivedAt: row.receivedAt },
      placeholderThreadId: row.threadId,
    });

    await db
      .update(messages)
      .set({
        threadId,
        status: "complete",
        subject,
        deliveredTo,
        fromAddress,
        to: mail.to ?? [],
        cc: mail.cc ?? [],
        textBody: mail.text ?? null,
        htmlBody: mail.html ?? null,
        headers,
        messageId: mail.message_id ?? headers["message-id"] ?? null,
        inReplyTo,
        references,
        spf: headers["received-spf"] ?? null,
        dkim: headers["dkim-signature"] ? "present" : null,
        dmarc: headers["authentication-results"] ?? null,
      })
      .where(eq(messages.id, messageId));

    // Deleting the placeholder cascades to its messages, so it can only go
    // once this message points at the surviving thread.
    if (threadId !== row.threadId) {
      await db.delete(threads).where(eq(threads.id, row.threadId));
    }

    await storeAttachments(messageId, row.resendId, mail.attachments ?? []);

    if (deliveredTo) {
      await db.insert(addresses).values({ address: deliveredTo }).onConflictDoNothing();
    }

    const [thread] = await db
      .select({ participants: threads.participants })
      .from(threads)
      .where(eq(threads.id, threadId));

    await db
      .update(threads)
      .set({
        subject,
        lastMessageAt: new Date(),
        messageCount: sql`${threads.messageCount} + 1`,
        participants: [...new Set([...(thread?.participants ?? []), ...participants])],
      })
      .where(eq(threads.id, threadId));

    await forwardCopy(messageId);
  } catch (error) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await db.update(messages).set({ status: "failed" }).where(eq(messages.id, messageId));
    }
    throw error;
  }
}

async function resolveAndAttach(input: { incoming: Incoming; placeholderThreadId: string }) {
  const { incoming, placeholderThreadId } = input;

  const referenced = [incoming.inReplyTo, ...incoming.references].filter(
    (id): id is string => Boolean(id),
  );

  const byMessageId = referenced.length
    ? ((await db
        .select({ messageId: messages.messageId, threadId: messages.threadId })
        .from(messages)
        .where(inArray(messages.messageId, referenced))) as {
        messageId: string;
        threadId: string;
      }[])
    : [];

  // Subject normalisation lives in one place, so candidates are filtered in
  // TypeScript rather than duplicating the prefix regex in SQL.
  const cutoff = new Date(incoming.receivedAt.getTime() - SUBJECT_WINDOW_MS);
  const recent = await db
    .select({
      threadId: threads.id,
      subject: threads.subject,
      participants: threads.participants,
      lastMessageAt: threads.lastMessageAt,
    })
    .from(threads)
    .where(gte(threads.lastMessageAt, cutoff))
    .limit(CANDIDATE_LIMIT);

  const wanted = normalizeSubject(incoming.subject);
  const bySubject = recent
    .filter((thread) => thread.threadId !== placeholderThreadId)
    .filter((thread) => normalizeSubject(thread.subject) === wanted);

  const decision = resolveThread(incoming, { byMessageId, bySubject }, { oldest: pickOldest(recent) });

  if (decision.action === "create") return placeholderThreadId;

  if (decision.action === "merge" && decision.absorb.length > 0) {
    await db
      .update(messages)
      .set({ threadId: decision.threadId })
      .where(inArray(messages.threadId, decision.absorb));
    await db.delete(threads).where(inArray(threads.id, decision.absorb));
  }

  return decision.threadId;
}

function pickOldest(known: { threadId: string; lastMessageAt: Date }[]) {
  return (threadIds: string[]) => {
    const dated = threadIds
      .map((id) => known.find((thread) => thread.threadId === id))
      .filter((thread): thread is { threadId: string; lastMessageAt: Date } => Boolean(thread));

    if (dated.length === 0) return threadIds[0];

    return dated.reduce((oldest, thread) =>
      thread.lastMessageAt < oldest.lastMessageAt ? thread : oldest,
    ).threadId;
  };
}

async function storeAttachments(
  messageId: string,
  resendId: string,
  listed: { id: string; filename: string; content_type: string; size: number; content_id?: string }[],
) {
  if (listed.length === 0) return;

  const storage = getStorage();

  for (const item of listed) {
    const key = `${messageId}/${item.id}`;

    await db
      .insert(attachments)
      .values({
        messageId,
        filename: item.filename,
        contentType: item.content_type,
        sizeBytes: item.size,
        storageKey: key,
        contentId: item.content_id ?? null,
      })
      .onConflictDoNothing();

    const download = await getAttachment(resendId, item.id);
    const body = await downloadAttachment(download.download_url);
    await storage.put(key, body, item.content_type);
  }
}
