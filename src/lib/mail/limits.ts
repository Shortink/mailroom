import { z } from "zod";

export const MAX_SUBJECT = 512;
export const MAX_BODY = 256 * 1024;
export const MAX_RECIPIENTS = 20;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;

// The HTML select and required attributes are client-side only; a crafted POST
// reaches the action directly, so the bounds live here.
export const outgoing = z.object({
  from: z.email(),
  to: z.array(z.email()).min(1).max(MAX_RECIPIENTS),
  subject: z.string().max(MAX_SUBJECT),
  text: z.string().min(1).max(MAX_BODY),
});
