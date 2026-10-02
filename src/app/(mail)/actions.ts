"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { record } from "@/lib/auth/audit";
import { readViewer, requireOwner, requireViewer } from "@/lib/auth/require";
import { VIEW_COOKIE } from "@/lib/auth/viewer";
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
import { normalizeAddress } from "@/lib/mail/identity";
import { reachesAddress } from "@/lib/mail/reach";
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
      ? await sendReply(viewer.allowed, { threadId: input.threadId, ...parsed.data })
      : await sendNew(viewer.allowed, parsed.data);

    // Resend publishes the assigned id shortly after delivery; the reconcile
    // sweep is the fallback if this misses.
    after(() => captureMessageId(messageId));

    // The draft existed only until the message left.
    if (input.draftId) await deleteDraft(viewer.userId, input.draftId);

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
  const viewer = await requireViewer();
  await setArchived(viewer.allowed, threadId, archived);
  revalidatePath("/", "layout");
}

export async function trashThread(threadId: string) {
  const viewer = await requireViewer();
  await setTrashed(viewer.allowed, threadId, true);
  revalidatePath("/", "layout");
}

export async function restoreThread(threadId: string) {
  const viewer = await requireViewer();
  const restored = await setTrashed(viewer.allowed, threadId, false);
  revalidatePath("/", "layout");
  // Same reason as deleteThread: a push from the client after the refresh
  // above fell back to reloading the thread instead of leaving it.
  redirect(restored?.archived ? "/b/archive" : "/");
}

export async function deleteThread(threadId: string) {
  const viewer = await requireViewer();
  await deleteForever(viewer.allowed, threadId);
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

  const id = await saveDraft(viewer, parsed.data);
  if (id) revalidatePath("/", "layout");
  return id;
}

export async function discardDraft(id: string) {
  const viewer = await requireViewer();

  await deleteDraft(viewer.userId, id);
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
  const viewer = await requireViewer();

  await markThreadRead(viewer.allowed, threadId);
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
  const viewer = await requireOwner();

  const from = await loadSender(viewer.allowed, messageId);
  if (from) await allowSender(from);
  revalidatePath("/", "layout");
}

export async function stopShowingImages(sender: string) {
  await requireOwner();

  await disallowSender(sender);
  revalidatePath("/", "layout");
}

export async function retryFailedMail() {
  await requireOwner();

  const result = await retryFailed();
  revalidatePath("/", "layout");
  return result;
}

export async function setView(choice: string) {
  // Read without the request cache, so the render that follows does not reuse
  // a viewer resolved from the old cookie.
  const viewer = await readViewer();
  if (!viewer) redirect("/login");

  const value = normalizeAddress(choice);
  if (value !== "all" && !(await reachesAddress(viewer.allowed, value))) notFound();

  (await cookies()).set(VIEW_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/");
}
