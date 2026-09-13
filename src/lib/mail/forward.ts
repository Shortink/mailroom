import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { messages } from "../db/schema";
import { forwardMarker } from "./marker";
import { sendEmail } from "./resend";

export async function forwardCopy(messageId: string) {
  const forwardTo = process.env.FORWARD_TO;
  if (!forwardTo) return;

  // Claimed in the statement that stamps it, so a retried ingest matches
  // nothing here and the copy goes out once.
  const [row] = await db
    .update(messages)
    .set({ forwardedAt: new Date() })
    .where(and(eq(messages.id, messageId), isNull(messages.forwardedAt)))
    .returning();
  if (!row) return;

  const preamble = [
    `From: ${row.fromAddress ?? "unknown"}`,
    `To: ${row.deliveredTo ?? "unknown"}`,
    `Subject: ${row.subject}`,
  ].join("\n");

  try {
    await sendEmail({
      from: row.deliveredTo ?? forwardTo,
      to: [forwardTo],
      subject: `[fwd] ${row.subject}`,
      text: `${preamble}\n\n${row.textBody ?? ""}`,
      html: row.htmlBody ?? undefined,
      // The webhook drops anything carrying this, so a forwarding address on
      // the receiving domain cannot create a loop.
      headers: { "X-Forwarded-By": forwardMarker() },
    });
  } catch {
    // Hand the claim back so the sweep tries again. The message is already
    // stored either way; a failed courtesy copy must not fail ingest.
    await db
      .update(messages)
      .set({ forwardedAt: null })
      .where(eq(messages.id, messageId));
  }
}
