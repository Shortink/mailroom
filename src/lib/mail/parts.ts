// Which attachments a body actually draws. A Content-ID alone is no signal:
// some clients put one on every part they attach.
export function referencedCids(html: string | null) {
  const found = new Set<string>();
  for (const match of (html ?? "").matchAll(/cid:([^"'\s>)]+)/g)) found.add(match[1]);
  return found;
}

// Whether a body would fetch from the sender if allowed to.
export function hasRemoteImages(html: string | null) {
  return /<img[^>]+src\s*=\s*["']?https?:/i.test(html ?? "");
}

// The markers Gmail, Apple Mail and Outlook put on the earlier messages a
// reply carries along.
export const QUOTE_SELECTOR = ".gmail_quote, blockquote[type=cite], #divRplyFwdMsg, #divRplyFwdMsg ~ *";

export function hasQuotedReply(html: string | null) {
  return /class="gmail_quote"|<blockquote[^>]+type="cite"|id="divRplyFwdMsg"/i.test(html ?? "");
}

// Where the quoted part of a plain-text reply begins, or -1.
export function quotedTextStart(text: string | null) {
  const lines = (text ?? "").split("\n");
  const at = lines.findIndex(
    (line) => /^On .+ wrote:\s*$/.test(line) || /^-+ ?Original Message ?-+$/i.test(line) || line.startsWith(">"),
  );
  if (at <= 0) return at;

  return lines.slice(0, at).join("\n").length;
}
