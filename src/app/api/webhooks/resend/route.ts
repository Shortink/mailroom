import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { Webhook } from "svix";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db/client";
import { addresses, messages, threads } from "@/lib/db/schema";
import { completeIngest } from "@/lib/mail/ingest";
import { forwardMarker } from "@/lib/mail/marker";
import { MAX_SUBJECT } from "@/lib/mail/limits";

export const runtime = "nodejs";

interface ReceivedEvent {
  type: string;
  data: {
    email_id?: string;
    received_for?: string[];
    from?: string;
    subject?: string;
    headers?: Record<string, string>;
  };
}

export async function POST(request: Request) {
  const raw = await request.text();

  try {
    // verify() checks the signature and throws on failure without handing the
    // payload back, so it is parsed separately below.
    new Webhook(requireEnv("RESEND_WEBHOOK_SECRET")).verify(raw, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    });
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw) as ReceivedEvent;

  if (event.type !== "email.received") return new Response("ignored", { status: 200 });

  // Copies this app forwarded would otherwise loop back in when FORWARD_TO is
  // an address on the receiving domain.
  if (event.data.headers?.["x-forwarded-by"] === forwardMarker()) {
    return new Response("ignored", { status: 200 });
  }

  const resendId = event.data.email_id;
  if (!resendId) return new Response("missing email_id", { status: 400 });

  // received_for is the envelope. The To header is whatever the sender wrote.
  const recipients = [
    ...new Set((event.data.received_for ?? []).map((address) => address.trim().toLowerCase())),
  ].filter(Boolean);
  if (recipients.length === 0) return new Response("missing recipient", { status: 400 });

  const subject = (event.data.subject ?? "").slice(0, MAX_SUBJECT);

  // Each recipient is its own delivery, with its own thread and its own row.
  for (const deliveredTo of recipients) {
    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.resendId, resendId), eq(messages.deliveredTo, deliveredTo)));
      if (existing) return null;

      await tx.insert(addresses).values({ address: deliveredTo }).onConflictDoNothing();
      const [thread] = await tx
        .insert(threads)
        .values({ subject, address: deliveredTo })
        .returning({ id: threads.id });

      const [row] = await tx
        .insert(messages)
        .values({
          threadId: thread.id,
          direction: "inbound",
          status: "pending",
          resendId,
          deliveredTo,
          fromAddress: event.data.from ?? null,
          subject,
        })
        .returning({ id: messages.id });

      return row;
    });

    if (created) after(() => completeIngest(created.id));
  }

  return new Response("ok", { status: 200 });
}
