import { z } from "zod";

export const MAX_SUBJECT = 512;
export const MAX_BODY = 256 * 1024;
export const MAX_RECIPIENTS = 20;
export const MAX_ADDRESS_FIELD = 1024;
export const MAX_LABEL = 128;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;
// How long an ingest is left to run before the sweep treats it as abandoned.
// Attachments are fetched one after another, so the work can take minutes, and
// a shorter window would forward the same message twice.
export const CLAIM_MS = 15 * 60 * 1000;

// The HTML select and required attributes are client-side only; a crafted POST
// reaches the action directly, so the bounds live here.
export const outgoing = z.object({
  from: z.email(),
  to: z.array(z.email()).min(1).max(MAX_RECIPIENTS),
  subject: z.string().max(MAX_SUBJECT),
  text: z.string().min(1).max(MAX_BODY),
});

// A draft is saved on a timer while it is still being written, so the fields
// are half-finished by definition. Only the bounds apply.
export const draft = z.object({
  id: z.string().max(64).optional(),
  threadId: z.string().max(64).nullish(),
  from: z.string().max(MAX_ADDRESS_FIELD),
  to: z.string().max(MAX_ADDRESS_FIELD),
  subject: z.string().max(MAX_SUBJECT),
  body: z.string().max(MAX_BODY),
});

// reply-to is put on outgoing mail, so it is held to the same standard as any
// other address the operator sends from.
export const addressSettings = z.object({
  label: z.string().max(MAX_LABEL).nullish(),
  displayName: z.string().max(MAX_LABEL).nullish(),
  replyTo: z.union([z.email(), z.literal(""), z.null()]).optional(),
  hue: z.number().int().min(0).max(360).nullish(),
  autoArchive: z.boolean().optional(),
  pinned: z.boolean().optional(),
});
