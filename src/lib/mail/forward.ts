import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { messages } from "../db/schema";
import { forwardMarker } from "./marker";
import { sendEmail } from "./resend";

export async function forwardCopy(messageId: string) {
  const forwardTo = process.env.FORWARD_TO;
  if (!forwardTo) return;

  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
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
    // The message is already stored; a failed courtesy copy must not fail ingest.
  }
}
