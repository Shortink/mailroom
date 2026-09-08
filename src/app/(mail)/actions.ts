"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { record } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/require";
import { deleteDraft, saveDraft, type DraftInput } from "@/lib/mail/drafts";
import { retryFailed } from "@/lib/mail/reconcile";
import { draft, outgoing } from "@/lib/mail/limits";
import {
  markThreadRead,
  searchThreads,
  setArchived,
  type SearchScope,
} from "@/lib/mail/queries";
import { formatWhen } from "@/lib/format";
import { captureMessageId, sendNew, sendReply } from "@/lib/mail/send";

export interface SendInput {
  draftId?: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export type { SearchScope };

export type SendResult = { ok: true; id: string; from: string } | { ok: false; error: string };

export async function sendMessage(input: SendInput): Promise<SendResult> {
  const userId = await requireUser();

  const parsed = outgoing.safeParse({
    from: input.from.trim(),
    to: input.to
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean),
    subject: input.subject.trim(),
    text: input.text.trim(),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That message isn't valid." };
  }

  try {
    const messageId = input.threadId
      ? await sendReply({ threadId: input.threadId, ...parsed.data })
      : await sendNew(parsed.data);

    // Resend publishes the assigned id shortly after delivery; the reconcile
    // sweep is the fallback if this misses.
    after(() => captureMessageId(messageId));

    // The draft existed only until the message left.
    if (input.draftId) await deleteDraft(input.draftId);

    await record("message.sent", {
      actor: userId,
      detail: { from: parsed.data.from, to: parsed.data.to, threadId: input.threadId ?? null },
    });

    revalidatePath("/", "layout");
    return { ok: true, id: messageId, from: parsed.data.from };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sending failed." };
  }
}

export async function archiveThread(threadId: string, archived: boolean) {
  await requireUser();
  await setArchived(threadId, archived);
  revalidatePath("/", "layout");
}

export async function storeDraft(input: DraftInput) {
  await requireUser();

  // The composer autosaves on every pause in typing, so an unbounded body
  // grows the table for as long as someone keeps writing.
  const parsed = draft.safeParse(input);
  if (!parsed.success) return null;

  const id = await saveDraft(parsed.data);
  revalidatePath("/", "layout");
  return id;
}

export async function discardDraft(id: string) {
  await requireUser();

  await deleteDraft(id);
  revalidatePath("/", "layout");
}

export interface SearchHit {
  id: string;
  sender: string;
  subject: string;
  address: string | null;
  time: string;
}

export async function searchMail(query: string, scope: SearchScope): Promise<SearchHit[]> {
  await requireUser();
  if (!query.trim()) return [];

  const rows = await searchThreads(query.trim(), scope);

  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    subject: row.subject || "(no subject)",
    address: row.address,
    time: formatWhen(row.at),
  }));
}

// Marking read has to happen in an action rather than during the thread
// render, so the list and rail can be revalidated with the new counts.
export async function markRead(threadId: string) {
  await requireUser();

  await markThreadRead(threadId);
  revalidatePath("/", "layout");
}

export async function retryFailedMail() {
  await requireUser();

  const result = await retryFailed();
  revalidatePath("/", "layout");
  return result;
}
