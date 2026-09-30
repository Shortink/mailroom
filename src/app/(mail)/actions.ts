"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { record } from "@/lib/auth/audit";
import { requireViewer } from "@/lib/auth/require";
import { deleteDraft, saveDraft, type DraftInput } from "@/lib/mail/drafts";
import { retryFailed } from "@/lib/mail/reconcile";
import { draft, outgoing } from "@/lib/mail/limits";
import {
  loadMessageHtml,
  loadSender,
  markThreadRead,
  searchThreads,
  setArchived,
  type SearchScope,
} from "@/lib/mail/queries";
import { formatWhen } from "@/lib/format";
import { renderHtml } from "@/lib/mail/render";
import { captureMessageId, sendNew, sendReply } from "@/lib/mail/send";
import { allowSender, disallowSender } from "@/lib/mail/images";
import { deleteForever, setTrashed } from "@/lib/mail/trash";
import { readerZone } from "@/lib/zone";

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
  const viewer = await requireViewer();

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
      actor: viewer.userId,
      detail: { from: parsed.data.from, to: parsed.data.to, threadId: input.threadId ?? null },
    });

    revalidatePath("/", "layout");
    return { ok: true, id: messageId, from: parsed.data.from };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sending failed." };
  }
}

export async function archiveThread(threadId: string, archived: boolean) {
  await requireViewer();
  await setArchived(threadId, archived);
  revalidatePath("/", "layout");
}

export async function trashThread(threadId: string) {
  await requireViewer();
  await setTrashed(threadId, true);
  revalidatePath("/", "layout");
}

export async function restoreThread(threadId: string) {
  await requireViewer();
  const restored = await setTrashed(threadId, false);
  revalidatePath("/", "layout");
  // Same reason as deleteThread: a push from the client after the refresh
  // above fell back to reloading the thread instead of leaving it.
  redirect(restored?.archived ? "/b/archive" : "/");
}

export async function deleteThread(threadId: string) {
  await requireViewer();
  await deleteForever(threadId);
  revalidatePath("/", "layout");
  // Leaving from here rather than the client, because the refresh above would
  // otherwise render the thread page for a thread that no longer exists.
  redirect("/b/trash");
}

export async function storeDraft(input: DraftInput) {
  const viewer = await requireViewer();

  // The composer autosaves on every pause in typing, so an unbounded body
  // grows the table for as long as someone keeps writing.
  const parsed = draft.safeParse(input);
  if (!parsed.success) return null;

  const id = await saveDraft(viewer.userId, parsed.data);
  revalidatePath("/", "layout");
  return id;
}

export async function discardDraft(id: string) {
  await requireViewer();

  await deleteDraft(id);
  revalidatePath("/", "layout");
}

export interface SearchHit {
  id: string;
  sender: string;
  subject: string;
  address: string;
  time: string;
}

export async function searchMail(query: string, scope: SearchScope): Promise<SearchHit[]> {
  const viewer = await requireViewer();
  if (!query.trim()) return [];

  const rows = await searchThreads(viewer.view, query.trim(), scope);
  const zone = await readerZone();

  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    subject: row.subject || "(no subject)",
    address: row.address,
    time: formatWhen(row.at, zone),
  }));
}

// Marking read has to happen in an action rather than during the thread
// render, so the list and rail can be revalidated with the new counts.
export async function markRead(threadId: string) {
  await requireViewer();

  await markThreadRead(threadId);
  revalidatePath("/", "layout");
}

// A message is first shown without remote images, since loading one tells the
// sender the address is read. This loads them on request.
export async function showImages(messageId: string) {
  const viewer = await requireViewer();

  const loaded = await loadMessageHtml(viewer.allowed, messageId);
  return loaded ? renderHtml(loaded.html, loaded.parts, { remote: true }) : null;
}

// Takes the message rather than an address, so the allowance can only ever
// name someone who actually wrote in.
export async function alwaysShowImages(messageId: string) {
  const viewer = await requireViewer();

  const from = await loadSender(viewer.allowed, messageId);
  if (from) await allowSender(from);
  revalidatePath("/", "layout");
}

export async function stopShowingImages(sender: string) {
  await requireViewer();

  await disallowSender(sender);
  revalidatePath("/", "layout");
}

export async function retryFailedMail() {
  await requireViewer();

  const result = await retryFailed();
  revalidatePath("/", "layout");
  return result;
}
