import { requireEnv } from "../env";

const API = "https://api.resend.com";

export interface ReceivedAttachment {
  id: string;
  filename: string;
  content_type: string;
  content_disposition?: string;
  content_id?: string;
  size: number;
}

export interface ReceivedEmail {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  received_for?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  message_id?: string | null;
  attachments?: ReceivedAttachment[];
}

export interface AttachmentDownload {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
  expires_at: string;
}

export interface SentEmail {
  id: string;
  last_event: string;
  message_id: string | null;
}

export interface SendInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Resend ${response.status}: ${body.message ?? response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function getReceivedEmail(id: string) {
  return call<ReceivedEmail>(`/emails/receiving/${id}`);
}

export function getAttachment(emailId: string, attachmentId: string) {
  return call<AttachmentDownload>(`/emails/receiving/${emailId}/attachments/${attachmentId}`);
}

// Download URLs are short-lived, so bytes are fetched during ingest and stored.
// The listed size is the sender's own claim, so the cap applies to the bytes
// that arrive. Returns null for anything over.
export async function downloadAttachment(url: string, limit: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Attachment download failed: ${response.status}`);
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.length;
      if (total > limit) return null;
      chunks.push(value);
    }
  } finally {
    // Cancelling a finished stream is a no-op; cancelling an abandoned one
    // stops the transfer rather than draining it.
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks);
}

export function sendEmail(input: SendInput) {
  const { replyTo, ...rest } = input;
  return call<{ id: string }>("/emails", {
    method: "POST",
    body: JSON.stringify({ ...rest, reply_to: replyTo }),
  });
}

export function getEmail(id: string) {
  return call<SentEmail>(`/emails/${id}`);
}
