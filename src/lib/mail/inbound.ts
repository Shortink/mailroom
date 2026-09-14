// What ingest needs from a received message, whichever way it arrived. Resend
// hands over parsed fields and a download link per attachment; Cloudflare hands
// over the raw message, which is parsed here into the same shape.

export interface InboundAttachment {
  // Stable within the message, so a repeated ingest lands on the same key.
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId: string | null;
  // Either the bytes, or a fetch that returns null past the size cap.
  bytes?: Buffer;
  fetch?: () => Promise<Buffer | null>;
}

export interface InboundMail {
  headers: Record<string, string>;
  from: string | null;
  to: string[];
  cc: string[];
  // The address on this domain the message was delivered for.
  receivedFor: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  attachments: InboundAttachment[];
}
