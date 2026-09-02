"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { outgoing } from "@/lib/mail/limits";
import { captureMessageId, sendNew, sendReply } from "@/lib/mail/send";

function read(form: FormData, field: string) {
  return String(form.get(field) ?? "").trim();
}

function recipients(form: FormData) {
  return read(form, "to")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

async function validate(form: FormData) {
  const parsed = outgoing.safeParse({
    from: read(form, "from"),
    to: recipients(form),
    subject: read(form, "subject"),
    text: read(form, "text"),
  });
  return parsed.success ? parsed.data : null;
}

export async function replyAction(formData: FormData) {
  await requireUser();

  const threadId = read(formData, "threadId");
  const input = await validate(formData);
  if (!input) return;

  const messageId = await sendReply({ threadId, ...input });

  // Resend publishes the assigned id shortly after delivery; the reconcile
  // sweep is the fallback if this misses.
  after(() => captureMessageId(messageId));

  revalidatePath(`/t/${threadId}`);
}

export async function composeAction(formData: FormData) {
  await requireUser();

  const input = await validate(formData);
  if (!input) return;

  const messageId = await sendNew(input);
  after(() => captureMessageId(messageId));

  redirect("/");
}
