"use client";

import { useEffect, useRef, useState } from "react";
import { showImages } from "@/app/(mail)/actions";
import {
  BracesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipIcon,
  EyeOffIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldIcon,
} from "@/components/icons";
import type { Verdict } from "@/lib/mail/auth";
import type { Header } from "@/lib/mail/headers";
import { QUOTE_SELECTOR, quotedTextStart } from "@/lib/mail/parts";

export interface ThreadFile {
  id: string;
  name: string;
  size: string;
  url: string;
  image: boolean;
  extension: string;
}

export interface ThreadMessage {
  id: string;
  name: string;
  address: string;
  to: string;
  ago: string;
  exact: string;
  snippet: string;
  initials: string;
  outbound: boolean;
  auth: { verdict: Verdict; detail: string };
  headers: Header[];
  html: string | null;
  text: string | null;
  remoteImages: boolean;
  // Whether the body carries the earlier messages of its thread.
  quoted: boolean;
  files: ThreadFile[];
}

// The sheet is the sender's document rather than app surface, so it stays light
// in both themes.
const SHEET = "oklch(0.985 0.004 285)";
const SHEET_FOOT = "oklch(0.955 0.004 285)";
const SHEET_INK = "oklch(0.52 0.015 285)";

// The frame has no styles of its own, so without these it gets the browser
// defaults. The message's own styling still wins.
const BASE = `<style>
body{margin:0;padding:12px 16px;font:14.5px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;background:transparent;word-wrap:break-word}
img{max-width:100%;height:auto}
a{color:#1a56db}
blockquote{margin:.5em 0 .5em .8em;padding-left:.8em;border-left:2px solid #ddd;color:#555}
</style>`;

// Folded until asked for, the way every client does it.
const HIDE_QUOTE = `<style>${QUOTE_SELECTOR}{display:none}</style>`;

// The height a frame keeps until it reports its own, so a message whose script
// never runs still reads.
const UNMEASURED = 320;

// The sender picks the height, so it has a ceiling.
const TALLEST = 20000;

// No same-origin access, so the frame sends its height instead of letting us
// read it. Scripts are allowed for that and the policy admits only this nonce,
// so anything that survived sanitising still cannot run.
//
// It measures the body, on load. The root element fills the frame and would
// report back the height the frame already had, and a script in the head runs
// before there is a body.
function measure(nonce: string, images: boolean) {
  const remote = images ? " https:" : "";
  const policy = [
    `script-src 'nonce-${nonce}'`,
    // The sanitiser strips these from the CSS. This catches what it misses.
    `font-src 'none'`,
    `img-src 'self' data:${remote}`,
  ].join("; ");

  return `<meta http-equiv="Content-Security-Policy" content="${policy}">
<script nonce="${nonce}">
(function(){
  var tell=function(){parent.postMessage({height:document.body.scrollHeight},"*")};
  addEventListener("message",tell);
  addEventListener("load",function(){
    tell();
    new ResizeObserver(tell).observe(document.body);
  });
})();
</script>`;
}

export function MessageThread({ messages, nonce }: { messages: ThreadMessage[]; nonce: string }) {
  // The message you came to read, plus your own last reply.
  const [expanded, setExpanded] = useState<string[]>(() => {
    const latest = messages.at(-1)?.id;
    const mine = messages.filter((message) => message.outbound).at(-1)?.id;
    return [...new Set([latest, mine].filter(Boolean) as string[])];
  });

  function toggle(id: string) {
    setExpanded((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) =>
        expanded.includes(message.id) ? (
          <Expanded
            key={message.id}
            message={message}
            nonce={nonce}
            onCollapse={() => toggle(message.id)}
          />
        ) : (
          <Collapsed key={message.id} message={message} onExpand={() => toggle(message.id)} />
        ),
      )}
    </div>
  );
}

function Collapsed({ message, onExpand }: { message: ThreadMessage; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex flex-none items-center gap-3 rounded-xl border border-line2 px-3.5 py-[11px] text-left transition-colors hover:bg-hover"
    >
      <Avatar initials={message.initials} size={24} />

      <span className="w-[176px] flex-none">
        <span className="block truncate text-[12.5px] font-semibold">{message.name}</span>
        <span className="block truncate font-mono text-[10px] text-ink2">{message.address}</span>
      </span>

      <AuthDot verdict={message.auth.verdict} detail={message.auth.detail} />

      <span className="min-w-0 flex-1 truncate text-[12px] text-ink3">{message.snippet}</span>

      {message.files.length > 0 && (
        <span className="flex flex-none items-center gap-1 font-mono text-[10px] text-ink3">
          <ClipIcon className="size-3" />
          {message.files.length} {message.files.length === 1 ? "file" : "files"}
        </span>
      )}

      <span className="flex-none font-mono text-[10px] text-ink3">{message.ago}</span>
      <ChevronDownIcon className="size-3.5 flex-none text-ink3" />
    </button>
  );
}

function Expanded({
  message,
  nonce,
  onCollapse,
}: {
  message: ThreadMessage;
  nonce: string;
  onCollapse: () => void;
}) {
  const [headersOpen, setHeadersOpen] = useState(false);

  return (
    <article className="relative flex-none overflow-hidden rounded-[14px] border border-line bg-chip">
      {message.outbound && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[2.5px]"
          style={{ background: "var(--accent)" }}
        />
      )}

      <div className="flex items-start gap-3 px-[17px] pt-[14px] pb-[13px]">
        <Avatar initials={message.initials} size={30} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[14px] font-semibold">{message.name}</span>
            <span className="truncate font-mono text-[11.5px] text-ink2">{message.address}</span>
            <AuthChip verdict={message.auth.verdict} detail={message.auth.detail} />
          </div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink3">
            {message.exact} · to {message.to}
          </div>
        </div>

        <div className="flex flex-none items-center gap-1.5">
          {message.headers.length > 0 && (
            <IconButton
              label={headersOpen ? "Hide raw headers" : "Show raw headers"}
              pressed={headersOpen}
              onClick={() => setHeadersOpen((open) => !open)}
            >
              <BracesIcon className="size-3.5" />
            </IconButton>
          )}
          <IconButton label="Collapse message" onClick={onCollapse}>
            <ChevronUpIcon className="size-3.5" />
          </IconButton>
        </div>
      </div>

      {headersOpen && <Headers headers={message.headers} />}

      <Body message={message} nonce={nonce} />

      {message.files.length > 0 && <Attachments files={message.files} />}

      {message.outbound && (
        <div
          className="flex items-center gap-2 border-t border-line px-[17px] py-2 font-mono text-[10px] text-ink2"
          style={{ background: "var(--accent-soft)" }}
        >
          <SendIcon className="size-3" />
          sent from {message.address} · composed as plain text · stored on this instance
        </div>
      )}
    </article>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex size-[26px] items-center justify-center rounded-[7px] border border-line text-ink3 transition-colors hover:bg-hover aria-pressed:text-ink"
    >
      {children}
    </button>
  );
}

const AUTH_INK: Record<Verdict, string> = {
  pass: "var(--ok)",
  fail: "var(--warn)",
  own: "var(--accent)",
  unknown: "var(--ink3)",
};

const AUTH_FILL: Record<Verdict, string> = {
  pass: "var(--ok-bg)",
  fail: "var(--warn-bg)",
  own: "var(--accent-soft)",
  unknown: "var(--chip)",
};

function AuthDot({ verdict, detail }: { verdict: Verdict; detail: string }) {
  return (
    <span
      title={detail}
      className="size-[7px] flex-none rounded-full"
      style={{ background: AUTH_INK[verdict] }}
    />
  );
}

function AuthChip({ verdict, detail }: { verdict: Verdict; detail: string }) {
  const Glyph = verdict === "pass" || verdict === "own" ? ShieldIcon : ShieldAlertIcon;

  return (
    <span
      className="inline-flex flex-none items-center gap-1 rounded-[5px] px-2 py-[3px] font-mono text-[10px]"
      style={{ background: AUTH_FILL[verdict], color: AUTH_INK[verdict] }}
    >
      <Glyph className="size-3" />
      {detail}
    </span>
  );
}

function Headers({ headers }: { headers: Header[] }) {
  return (
    <dl
      className="mx-[17px] mb-3 rounded-[9px] border border-line2 px-[13px] py-[11px]"
      style={{ background: "var(--sunk)" }}
    >
      {headers.map((header) => (
        <div key={header.key} className="flex gap-3 py-[3px]">
          <dt className="w-[128px] flex-none font-mono text-[10px] text-ink2">{header.key}</dt>
          <dd className="min-w-0 flex-1 font-mono text-[10px] break-all text-ink2">
            {header.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Body({ message, nonce }: { message: ThreadMessage; nonce: string }) {
  const [withImages, setWithImages] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [asPlain, setAsPlain] = useState(false);
  const [height, setHeight] = useState(UNMEASURED);
  const frame = useRef<HTMLIFrameElement>(null);

  // The frame has an opaque origin, so there is no origin to check. The sending
  // window is the only way to tell its messages from anyone else's.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;

      const reported = (event.data as { height?: unknown })?.height;
      if (typeof reported === "number" && reported > 0) {
        setHeight(Math.min(Math.ceil(reported), TALLEST));
      }
    }

    addEventListener("message", onMessage);

    // srcdoc is in the server HTML, so the frame usually loads and reports
    // before this listener exists. Asking covers that order, the frame
    // reporting on its own covers the other one.
    frame.current?.contentWindow?.postMessage("height", "*");

    return () => removeEventListener("message", onMessage);
  }, [asPlain]);

  const hasHtml = Boolean(message.html);
  const plain = !hasHtml || asPlain;

  async function load() {
    setLoading(true);
    setWithImages(await showImages(message.id));
    setLoading(false);
  }

  return (
    <div>
      <PathStrip
        outbound={message.outbound}
        plain={plain}
        canSwap={hasHtml && Boolean(message.text)}
        onSwap={() => setAsPlain((was) => !was)}
      />

      <div className="px-[17px] pt-3 pb-1">
        {plain ? (
          <PlainBody
            text={message.text}
            showQuoted={showQuoted}
            onShowQuoted={() => setShowQuoted(true)}
          />
        ) : (
          <>
            {message.remoteImages && (
              <Privacy loaded={Boolean(withImages)} loading={loading} onLoad={load} />
            )}

            <div
              className="overflow-hidden rounded-[10px] border border-line"
              style={{ background: SHEET }}
            >
              {/* The popup allowances let a link open a tab, and let that tab be
                  an ordinary page rather than one that inherits the sandbox. */}
              <iframe
                ref={frame}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                title="Message"
                srcDoc={
                  BASE +
                  measure(nonce, withImages !== null) +
                  (message.quoted && !showQuoted ? HIDE_QUOTE : "") +
                  (withImages ?? message.html)
                }
                className="w-full border-0"
                style={{ height, colorScheme: "light" }}
              />
              <div
                className="border-t border-line px-4 py-1.5 font-mono text-[10px]"
                style={{ background: SHEET_FOOT, color: SHEET_INK }}
              >
                sandboxed frame · scripts stripped · remote fonts blocked
              </div>
            </div>

            {message.quoted && !showQuoted && (
              <QuotedPill onClick={() => setShowQuoted(true)} label="Show quoted text" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PathStrip({
  outbound,
  plain,
  canSwap,
  onSwap,
}: {
  outbound: boolean;
  plain: boolean;
  canSwap: boolean;
  onSwap: () => void;
}) {
  const composed = outbound ? "text/plain · composed here" : "text/plain";

  return (
    <div
      className="flex items-center justify-between gap-3 border-y border-line2 px-[17px] py-1.5 font-mono text-[10px] text-ink3"
      style={{ background: "var(--sunk)" }}
    >
      <span className="truncate">{plain ? composed : "text/html · sandboxed"}</span>
      {canSwap && (
        <button
          type="button"
          onClick={onSwap}
          className="flex-none rounded-md border border-line px-2 py-0.5 text-ink2 transition-colors hover:bg-hover"
        >
          {plain ? "render html" : "view plain text"}
        </button>
      )}
    </div>
  );
}

function Privacy({
  loaded,
  loading,
  onLoad,
}: {
  loaded: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  if (loaded) {
    return (
      <div className="mb-2 rounded-lg bg-hover px-3 py-1.5 text-[11.5px] text-ink3">
        Remote images loaded for this message only.
      </div>
    );
  }

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        background: "var(--warn-bg)",
        borderColor: "var(--warn-line)",
        color: "var(--warn)",
      }}
    >
      <EyeOffIcon className="size-3.5 flex-none" />
      <span className="min-w-0 flex-1">
        Remote images blocked. Loading them tells the sender you opened this.
      </span>
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        className="flex-none rounded-md border px-2 py-0.5 transition-colors hover:bg-hover disabled:opacity-50"
        style={{ borderColor: "var(--warn-line)" }}
      >
        Load images
      </button>
    </div>
  );
}

function PlainBody({
  text,
  showQuoted,
  onShowQuoted,
}: {
  text: string | null;
  showQuoted: boolean;
  onShowQuoted: () => void;
}) {
  const cut = showQuoted ? -1 : quotedTextStart(text);

  return (
    <div>
      <pre className="max-w-[64ch] font-sans text-[14.5px] leading-[1.75] whitespace-pre-wrap text-ink2">
        {cut > 0 ? text!.slice(0, cut).trimEnd() : text}
      </pre>
      {cut > 0 && <QuotedPill onClick={onShowQuoted} label="Show trimmed lines" />}
    </div>
  );
}

function QuotedPill({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 rounded-[7px] bg-hover px-2 py-1 text-[11.5px] text-ink3 transition-colors hover:bg-chip"
    >
      {label}
    </button>
  );
}

function Attachments({ files }: { files: ThreadFile[] }) {
  return (
    <div className="mx-[17px] border-t border-line2 py-3">
      <div className="mb-2 font-mono text-[10px] tracking-wide text-ink3 uppercase">
        {files.length} {files.length === 1 ? "attachment" : "attachments"}
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {files.map((file) =>
          file.image ? (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noopener"
              className="w-[152px] overflow-hidden rounded-lg border border-line transition-colors hover:border-accent"
            >
              <img src={file.url} alt={file.name} className="h-[88px] w-full object-cover" />
              <span className="block truncate px-2 pt-1.5 text-[11.5px]">{file.name}</span>
              <span className="block px-2 pb-1.5 font-mono text-[10px] text-ink3">
                {file.extension} · {file.size}
              </span>
            </a>
          ) : (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 transition-colors hover:border-accent"
            >
              <span className="flex h-[34px] w-[28px] flex-none items-center justify-center rounded-[3px] border border-line2 font-mono text-[8px] text-ink3">
                {file.extension}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11.5px]">{file.name}</span>
                <span className="block font-mono text-[10px] text-ink3">{file.size}</span>
              </span>
            </a>
          ),
        )}
      </div>
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
