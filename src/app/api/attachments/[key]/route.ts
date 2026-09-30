import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attachments, messages, threads } from "@/lib/db/schema";
import { currentViewer } from "@/lib/auth/require";
import { attachmentUrlIsValid } from "@/lib/mail/attachmentLink";
import { inReach } from "@/lib/mail/reach";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

// The bytes and the declared type both come from the sender, and this origin
// runs the app. Types the browser draws are shown inline; anything it would
// parse as a document, markup included, downloads instead.
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const storageKey = decodeURIComponent(key);

  // A session, or a link the thread page signed for the frame that has none.
  // That page already passed the check below, so a signed link skips it.
  const { searchParams } = new URL(request.url);
  const signed = attachmentUrlIsValid(storageKey, searchParams.get("exp"), searchParams.get("sig"));
  const viewer = signed ? null : await currentViewer();
  if (!signed && !viewer) return new Response("unauthorized", { status: 401 });

  const [found] = await db
    .select({ attachment: attachments })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(
      and(
        eq(attachments.storageKey, storageKey),
        viewer ? inReach(threads.address, viewer.allowed) : undefined,
      ),
    );
  if (!found) return new Response("not found", { status: 404 });
  const row = found.attachment;

  const body = await getStorage().get(storageKey);
  if (!body) return new Response("not found", { status: 404 });

  const declared = row.contentType.split(";")[0].trim().toLowerCase();
  const inline = INLINE_TYPES.has(declared);
  // Quotes or control characters in a filename would break out of the header.
  const filename = row.filename.replace(/[^\w.\- ]/g, "_");

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": inline ? declared : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
