"use client";

import { useState } from "react";
import { ClipIcon, DocIcon } from "@/components/icons";
import { textIsEnough } from "@/lib/mail/body";

export interface ThreadMessage {
  id: string;
  name: string;
  address: string;
  to: string;
  time: string;
  snippet: string;
  initials: string;
  html: string | null;
  text: string | null;
  files: { id: string; name: string; size: string; url: string }[];
}

export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  // The newest message is the one you came to read; older ones stay folded.
  const [expanded, setExpanded] = useState<string[]>(() =>
    messages.length ? [messages[messages.length - 1].id] : [],
  );

  function toggle(id: string) {
    setExpanded((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) =>
        expanded.includes(message.id) ? (
          <article
            key={message.id}
            className="flex-none rounded-[14px] border border-line bg-chip"
          >
            <button
              type="button"
              onClick={() => toggle(message.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <Avatar initials={message.initials} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{message.name}</span>
                <span className="block truncate font-mono text-[10.5px] text-ink3">
                  to {message.to} · {message.time}
                </span>
              </span>
              <span className="flex-none font-mono text-[10.5px] text-ink3">collapse</span>
            </button>

            <div className="px-4 pb-4">
              <Body html={message.html} text={message.text} />

              {message.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.files.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink2 transition-colors hover:bg-hover"
                    >
                      <DocIcon className="size-3.5" />
                      {file.name}
                      <span className="font-mono text-[10.5px] text-ink3">{file.size}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ) : (
          <button
            key={message.id}
            type="button"
            onClick={() => toggle(message.id)}
            className="flex flex-none items-center gap-3 rounded-xl border border-line2 px-3.5 py-[11px] text-left transition-colors hover:bg-hover"
          >
            <Avatar initials={message.initials} size={22} />
            <span className="flex-none text-[13px] font-medium">{message.name}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink3">
              {message.snippet}
            </span>
            {message.files.length > 0 && <ClipIcon className="size-3 flex-none text-ink3" />}
            <span className="flex-none font-mono text-[10.5px] text-ink3">{message.time}</span>
          </button>
        ),
      )}
    </div>
  );
}

function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full font-semibold text-white"
      style={{ background: "var(--brand)", width: size, height: size, fontSize: size / 2.9 }}
    >
      {initials}
    </span>
  );
}

function Body({ html, text }: { html: string | null; text: string | null }) {
  if (!html || textIsEnough(html, text)) {
    return (
      <pre className="max-w-[680px] font-sans text-[14.5px] leading-[1.75] whitespace-pre-wrap text-ink2">
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
      srcDoc={html}
      className="w-full border-0"
      style={{ height: 320 }}
    />
  );
}
