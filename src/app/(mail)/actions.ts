"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { captureMessageId, sendNew, sendReply } from "@/lib/mail/send";

function read(form: FormData, field: string) {
  return String(form.get(field) ?? "").trim();
}

export async function replyAction(formData: FormData) {
  await requireUser();

  const threadId = read(formData, "threadId");
  const text = read(formData, "text");
  if (!text) return;

  const messageId = await sendReply({
    threadId,
    from: read(formData, "from"),
    to: read(formData, "to").split(",").map((address) => address.trim()).filter(Boolean),
    subject: read(formData, "subject"),
    text,
  });

  // Resend publishes the assigned id shortly after delivery; the reconcile
  // sweep is the fallback if this misses.
  after(() => captureMessageId(messageId));

  revalidatePath(`/t/${threadId}`);
}

export async function composeAction(formData: FormData) {
  await requireUser();

  const to = read(formData, "to").split(",").map((address) => address.trim()).filter(Boolean);
  const subject = read(formData, "subject");
  const text = read(formData, "text");
  if (to.length === 0 || !text) return;

  const messageId = await sendNew({ from: read(formData, "from"), to, subject, text });
  after(() => captureMessageId(messageId));

  redirect("/");
}
