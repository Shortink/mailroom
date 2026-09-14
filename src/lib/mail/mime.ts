import PostalMime, { type Address, type Attachment } from "postal-mime";
import type { InboundMail } from "./inbound";

function addresses(list: Address[] | undefined) {
  const out: string[] = [];
  for (const entry of list ?? []) {
    if (entry.group) {
      for (const member of entry.group) if (member.address) out.push(member.address);
    } else if (entry.address) {
      out.push(entry.address);
    }
  }
  return out;
}

function bytesOf(attachment: Attachment) {
  const { content } = attachment;
  if (typeof content === "string") {
    return Buffer.from(content, attachment.encoding === "base64" ? "base64" : "utf8");
  }
  return content instanceof ArrayBuffer ? Buffer.from(content) : Buffer.from(content);
}

// A Content-ID header carries angle brackets; an HTML body's cid: reference
// does not.
function contentId(value: string | undefined) {
  return value ? value.replace(/^<|>$/g, "") : null;
}

export async function parseMime(raw: Buffer, envelope: { to: string }): Promise<InboundMail> {
  const email = await PostalMime.parse(raw);

  // Headers are kept in message order and the first of a name wins. A
  // receiving server writes its own Authentication-Results above whatever
  // arrived, so the top one is the one to trust.
  const headers: Record<string, string> = {};
  for (const header of email.headers) headers[header.key] ??= header.value;

  return {
    headers,
    from: email.from?.address ?? null,
    to: addresses(email.to),
    cc: addresses(email.cc),
    receivedFor: envelope.to,
    subject: email.subject ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    messageId: email.messageId ?? null,
    attachments: email.attachments.map((attachment, index) => {
      const bytes = bytesOf(attachment);
      return {
        id: `part-${index}`,
        filename: attachment.filename ?? "attachment",
        contentType: attachment.mimeType,
        size: bytes.length,
        contentId: contentId(attachment.contentId),
        bytes,
      };
    }),
  };
}
