import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, attachments, messages, threads } from "../db/schema";
import { getStorage } from "../storage";
import { mailArrived } from "./events";
import { forwardCopy } from "./forward";
import { downloadAttachment, getAttachment, getReceivedEmail } from "./resend";
import { CLAIM_MS, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_BODY, MAX_SUBJECT } from "./limits";
import { normalizeSubject, resolveThread, type Incoming } from "./threading";

const MAX_ATTEMPTS = 5;
const SUBJECT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 200;
// A References header is written by the sender and has no length limit of its
// own, so it is capped before it reaches a query.
const MAX_REFERENCES = 50;

export async function completeIngest(messageId: string) {
  // The timer and the task endpoint can reach the same message at once, so the
  // row is claimed in the statement that stamps it. The second caller matches
  // nothing, and the attempt count is incremented in place rather than read
  // and written back.
  const [row] = await db
    .update(messages)
    .set({ attempts: sql`${messages.attempts} + 1`, lastAttemptAt: new Date() })
    .where(
      and(
        eq(messages.id, messageId),
        ne(messages.status, "complete"),
        or(
          isNull(messages.lastAttemptAt),
          lt(messages.lastAttemptAt, new Date(Date.now() - CLAIM_MS)),
        ),
      ),
    )
    .returning();
  if (!row || !row.resendId) return;

  try {
    const mail = await getReceivedEmail(row.resendId);
    const headers = mail.headers ?? {};
    const references = (headers["references"] ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_REFERENCES);
    const inReplyTo = headers["in-reply-to"] ?? null;
    const subject = (mail.subject ?? row.subject).slice(0, MAX_SUBJECT);
    const deliveredTo = mail.received_for?.[0] ?? row.deliveredTo;
    const fromAddress = mail.from ?? row.fromAddress;

    const participants = [fromAddress, deliveredTo, ...(mail.to ?? [])].filter(
      (address): address is string => Boolean(address),
    );
    // Everything arrives at one domain, so this is what tells an operator
    // address from a stranger's.
    const domain = deliveredTo?.split("@")[1]?.toLowerCase() ?? "";

    const threadId = await resolveAndAttach({
      incoming: { inReplyTo, references, subject, participants, domain, receivedAt: row.receivedAt },
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
        textBody: mail.text?.slice(0, MAX_BODY) ?? null,
        htmlBody: mail.html?.slice(0, MAX_BODY) ?? null,
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

    // The message is only visible now, so this is the point worth announcing.
    mailArrived();
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
        .select({
          messageId: messages.messageId,
          threadId: messages.threadId,
          participants: threads.participants,
        })
        .from(messages)
        .innerJoin(threads, eq(threads.id, messages.threadId))
        .where(inArray(messages.messageId, referenced))) as {
        messageId: string;
        threadId: string;
        participants: string[];
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

  // Receiving is catch-all, so anyone can drive attachment storage. The count is
  // bounded here and the size at the download, which is the only place the real
  // length is known.
  for (const item of listed.slice(0, MAX_ATTACHMENTS)) {
    if (item.size > MAX_ATTACHMENT_BYTES) continue;
    const key = `${messageId}/${item.id}`;

    const download = await getAttachment(resendId, item.id);
    const body = await downloadAttachment(download.download_url, MAX_ATTACHMENT_BYTES);
    if (!body) continue;

    await storage.put(key, body, item.content_type);

    await db
      .insert(attachments)
      .values({
        messageId,
        filename: item.filename,
        contentType: item.content_type,
        sizeBytes: body.length,
        storageKey: key,
        contentId: item.content_id ?? null,
      })
      .onConflictDoNothing();
  }
}
