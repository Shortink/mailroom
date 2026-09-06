import { sanitizeEmailHtml } from "@/lib/mail/sanitize";

interface Props {
  html: string | null;
  text: string | null;
  cids: Record<string, string>;
}

export function MessageBody({ html, text, cids }: Props) {
  if (!html) {
    return (
      <pre className="max-w-[68ch] font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
        {text}
      </pre>
    );
  }

  // An empty sandbox attribute blocks scripts, forms and same-origin access.
  // The markup is already sanitized server-side.
  return (
    <iframe
      sandbox=""
      title="Message"
      srcDoc={sanitizeEmailHtml(html, { cids })}
      className="w-full border-0"
      style={{ height: 320 }}
    />
  );
}
