// Which attachments a body actually draws. A Content-ID alone is no signal:
// some clients put one on every part they attach.
export function referencedCids(html: string | null) {
  const found = new Set<string>();
  for (const match of (html ?? "").matchAll(/cid:([^"'\s>)]+)/g)) found.add(match[1]);
  return found;
}
