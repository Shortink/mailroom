import { getStorage } from "../storage";
import { signAttachmentUrl } from "./attachmentLink";
import { sanitizeEmailHtml } from "./sanitize";

interface Part {
  contentId: string | null;
  storageKey: string;
}

// Inline images load inside the frame, which sends no cookie, so their links
// carry their own proof.
function cidLinks(parts: Part[]) {
  const storage = getStorage();
  return Object.fromEntries(
    parts
      .filter((part) => part.contentId)
      .map((part) => [part.contentId!, signAttachmentUrl(storage.url(part.storageKey), part.storageKey)]),
  );
}

export function renderHtml(html: string, parts: Part[], options: { remote?: boolean } = {}) {
  return sanitizeEmailHtml(html, { cids: cidLinks(parts), allowRemoteImages: options.remote });
}
