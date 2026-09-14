import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { addresses, attachments, messages, threads } from "../db/schema";
import { getStorage } from "../storage";
import { mailArrived } from "./events";
import { forwardCopy } from "./forward";
import type { InboundAttachment, InboundMail } from "./inbound";
import { downloadAttachment, getAttachment, getReceivedEmail } from "./resend";
import { CLAIM_MS, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_BODY, MAX_SUBJECT } from "./limits";
import { normalizeSubject, resolveThread, type Incoming } from "./threading";

type Row = typeof messages.$inferSelect;

const MAX_ATTEMPTS = 5;
const SUBJECT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 200;
// A References header is written by the sender and has no length limit of its
// own, so it is capped before it reaches a query.
const MAX_REFERENCES = 50;

// Mail that arrived as a Resend webhook, which carries the envelope only. The
// body and attachments are fetched here, out of band.
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
        isNull(messages.ingestedAt),
        or(
          isNull(messages.lastAttemptAt),
          lt(messages.lastAttemptAt, new Date(Date.now() - CLAIM_MS)),
        ),
      ),
    )
    .returning();
  if (!row || !row.resendId) return;

  try {
    const mail = await fromResend(row.resendId);
    await land(row, mail);

    // Each step below repeats safely, so a failure leaves ingestedAt unset and
    // the sweep finishes what is left.
    await storeAttachments(messageId, mail.attachments);
    await forwardCopy(messageId);

    await db.update(messages).set({ ingestedAt: new Date() }).where(eq(messages.id, messageId));

    mailArrived();
  } catch (error) {
    // A body that never arrived is worth showing as a failure. One that did
    // stays readable even when the work behind it runs out of attempts.
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await db
        .update(messages)
        .set({ status: "failed" })
        .where(and(eq(messages.id, messageId), eq(messages.status, "pending")));
    }
    throw error;
  }
}

// Mail that arrived whole. Nothing is fetched afterwards, so it finishes inside
// the request rather than through the pending state the sweep watches.
export async function ingestParsed(mail: InboundMail) {
  if (mail.messageId) {
    const [existing] = await db
      .select({ id: messages.id, ingestedAt: messages.ingestedAt })
      .from(messages)
      .where(eq(messages.messageId, mail.messageId));
    if (existing?.ingestedAt) return existing.id;

    // Left by an attempt that failed part way.
    if (existing) await db.delete(messages).where(eq(messages.id, existing.id));
  }

  const subject = (mail.subject ?? "").slice(0, MAX_SUBJECT);

  const [thread] = await db.insert(threads).values({ subject }).returning({ id: threads.id });

  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      status: "pending",
      messageId: mail.messageId,
      deliveredTo: mail.receivedFor,
      fromAddress: mail.from,
      subject,
    })
    .returning();

  try {
    await land(row, mail);
    await storeAttachments(row.id, mail.attachments);

    // Forwarded by whatever received it, so nothing here sends a copy.
    await db
      .update(messages)
      .set({ ingestedAt: new Date(), forwardedAt: new Date() })
      .where(eq(messages.id, row.id));

    mailArrived();
    return row.id;
  } catch (error) {
    // Nothing partial is left for the retry to find. The placeholder thread is
    // only still there if the message never moved off it.
    await db.delete(messages).where(eq(messages.id, row.id)).catch(() => {});
    await db.delete(threads).where(eq(threads.id, thread.id)).catch(() => {});
    throw error;
  }
}

async function fromResend(resendId: string): Promise<InboundMail> {
  const mail = await getReceivedEmail(resendId);

  return {
    headers: mail.headers ?? {},
    from: mail.from ?? null,
    to: mail.to ?? [],
    cc: mail.cc ?? [],
    receivedFor: mail.received_for?.[0] ?? null,
    subject: mail.subject ?? null,
    text: mail.text ?? null,
    html: mail.html ?? null,
    messageId: mail.message_id ?? null,
    attachments: (mail.attachments ?? []).map((item) => ({
      id: item.id,
      filename: item.filename,
      contentType: item.content_type,
      size: item.size,
      contentId: item.content_id ?? null,
      fetch: async () => {
        const download = await getAttachment(resendId, item.id);
        return downloadAttachment(download.download_url, MAX_ATTACHMENT_BYTES);
      },
    })),
  };
}

// Writes the body and settles which thread the message belongs to. From here
// the message is readable.
async function land(row: Row, mail: InboundMail) {
  const { headers } = mail;
  const references = (headers["references"] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_REFERENCES);
  const inReplyTo = headers["in-reply-to"] ?? null;
  const subject = (mail.subject ?? row.subject).slice(0, MAX_SUBJECT);
  const deliveredTo = mail.receivedFor ?? row.deliveredTo;
  const fromAddress = mail.from ?? row.fromAddress;

  const participants = [fromAddress, deliveredTo, ...mail.to].filter(
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
      to: mail.to,
      cc: mail.cc,
      textBody: mail.text?.slice(0, MAX_BODY) ?? null,
      htmlBody: mail.html?.slice(0, MAX_BODY) ?? null,
      headers,
      messageId: mail.messageId ?? headers["message-id"] ?? null,
      inReplyTo,
      references,
      spf: headers["received-spf"] ?? null,
      dkim: headers["dkim-signature"] ? "present" : null,
      dmarc: headers["authentication-results"] ?? null,
    })
    .where(eq(messages.id, row.id));

  // Deleting the placeholder cascades to its messages, so it can only go
  // once this message points at the surviving thread.
  if (threadId !== row.threadId) {
    await db.delete(threads).where(eq(threads.id, row.threadId));
  }

  const [thread] = await db
    .select({ participants: threads.participants })
    .from(threads)
    .where(eq(threads.id, threadId));

  // Counted rather than incremented, because the steps after this one can be
  // retried and an increment would run twice. Participants land here too:
  // matching a later reply needs them before the attachments are fetched.
  await db
    .update(threads)
    .set({
      subject,
      lastMessageAt: new Date(),
      messageCount: sql`(select count(*) from ${messages} where ${messages.threadId} = ${threadId})`,
      participants: [...new Set([...(thread?.participants ?? []), ...participants])],
    })
    .where(eq(threads.id, threadId));

  if (deliveredTo) {
    await db.insert(addresses).values({ address: deliveredTo }).onConflictDoNothing();
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

async function storeAttachments(messageId: string, listed: InboundAttachment[]) {
  if (listed.length === 0) return;

  const storage = getStorage();

  // Receiving is catch-all, so anyone can drive attachment storage. The count is
  // bounded here and the size on the bytes themselves.
  for (const item of listed.slice(0, MAX_ATTACHMENTS)) {
    if (item.size > MAX_ATTACHMENT_BYTES) continue;
    const key = `${messageId}/${item.id}`;

    const body = item.bytes ?? (await item.fetch?.()) ?? null;
    if (!body || body.length > MAX_ATTACHMENT_BYTES) continue;

    await storage.put(key, body, item.contentType);

    await db
      .insert(attachments)
      .values({
        messageId,
        filename: item.filename,
        contentType: item.contentType,
        sizeBytes: body.length,
        storageKey: key,
        contentId: item.contentId,
      })
      .onConflictDoNothing();
  }
}
