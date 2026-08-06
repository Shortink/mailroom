import { eq } from "drizzle-orm";
import { after } from "next/server";
import { Webhook } from "svix";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import { messages, threads } from "@/lib/db/schema";
import { completeIngest } from "@/lib/mail/ingest";

export const runtime = "nodejs";

interface ReceivedEvent {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    received_for?: string[];
    from?: string;
    subject?: string;
    headers?: Record<string, string>;
  };
}

export async function POST(request: Request) {
  const raw = await request.text();

  let event: ReceivedEvent;
  try {
    event = new Webhook(getConfig().RESEND_WEBHOOK_SECRET).verify(raw, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as unknown as ReceivedEvent;
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  if (event.type !== "email.received") return new Response("ignored", { status: 200 });

  // Copies this app forwarded would otherwise loop back in when FORWARD_TO is
  // an address on the receiving domain.
  if (event.data.headers?.["x-forwarded-by"]) {
    return new Response("ignored", { status: 200 });
  }

  const resendId = event.data.email_id;
  if (!resendId) return new Response("missing email_id", { status: 400 });

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.resendId, resendId));
    if (existing) return null;

    const subject = event.data.subject ?? "";
    const [thread] = await tx.insert(threads).values({ subject }).returning({ id: threads.id });

    const [row] = await tx
      .insert(messages)
      .values({
        threadId: thread.id,
        direction: "inbound",
        status: "pending",
        resendId,
        deliveredTo: event.data.received_for?.[0] ?? event.data.to?.[0] ?? null,
        fromAddress: event.data.from ?? null,
        subject,
      })
      .returning({ id: messages.id });

    return row;
  });

  if (created) after(() => completeIngest(created.id));

  return new Response("ok", { status: 200 });
}
