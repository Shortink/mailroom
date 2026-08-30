import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attachments } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/require";
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

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  await requireUser();

  const { key } = await params;
  const storageKey = decodeURIComponent(key);

  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.storageKey, storageKey));
  if (!row) return new Response("not found", { status: 404 });

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
