"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { sendMessage, storeDraft } from "@/app/(mail)/actions";
import { ChevronDownIcon, CloseIcon, MinimiseIcon } from "@/components/icons";
import { addressColor } from "@/lib/mail/identity";

export interface Draft {
  id?: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  body?: string;
}

interface ComposeApi {
  open: (draft: Draft) => void;
}

const Ctx = createContext<ComposeApi | null>(null);

export function useCompose() {
  const api = useContext(Ctx);
  if (!api) throw new Error("useCompose used outside ComposeProvider");
  return api;
}

type State = "idle" | "sending" | "failed";

export function ComposeProvider({
  accounts,
  children,
}: {
  accounts: string[];
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sent, setSent] = useState<{ from: string; id: string } | null>(null);

  const open = useCallback((next: Draft) => {
    setSent(null);
    setDraft(next);
  }, []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {draft && (
        <Composer
          draft={draft}
          accounts={accounts}
          onClose={() => setDraft(null)}
          onSent={(result) => {
            setDraft(null);
            setSent(result);
          }}
        />
      )}
      {sent && <Toast {...sent} onClose={() => setSent(null)} />}
    </Ctx.Provider>
  );
}

function Composer({
  draft,
  accounts,
  onClose,
  onSent,
}: {
  draft: Draft;
  accounts: string[];
  onClose: () => void;
  onSent: (result: { from: string; id: string }) => void;
}) {
  const [from, setFrom] = useState(draft.from || accounts[0] || "");
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.body ?? "");
  // Held in a ref rather than state: storing the id the server hands back
  // must not retrigger the save effect, or every edit saves twice.
  const draftId = useRef(draft.id);
  const [saved, setSaved] = useState(Boolean(draft.id));
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [minimised, setMinimised] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (picking) setPicking(false);
      else onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, onClose]);

  // Saved a beat after typing stops, so closing the composer or losing the tab
  // keeps the message. A reply arrives with its recipient and subject filled,
  // so only a written body is worth saving.
  useEffect(() => {
    if (!text.trim()) return;
    setSaved(false);

    const timer = setTimeout(async () => {
      draftId.current = await storeDraft({
        id: draftId.current,
        threadId: draft.threadId ?? null,
        from,
        to,
        subject,
        body: text,
      });
      setSaved(true);
    }, 800);

    return () => clearTimeout(timer);
  }, [text, to, subject, from, draft.threadId]);

  async function send() {
    setState("sending");
    setError(null);

    const result = await sendMessage({
      draftId: draftId.current,
      threadId: draft.threadId,
      from,
      to,
      subject,
      text,
    });

    if (result.ok) {
      onSent({ from: result.from, id: result.id });
    } else {
      setState("failed");
      setError(result.error);
    }
  }

  return (
    <div className="animate-dock-in absolute right-6 bottom-0 z-30 w-[452px] rounded-t-[14px] border border-b-0 border-line bg-panel2 backdrop-blur-[28px] [box-shadow:var(--composer-shadow)] max-md:inset-0 max-md:w-auto max-md:overflow-y-auto max-md:rounded-none max-md:border-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink3 uppercase">
          {draft.threadId ? "Reply" : "New message"}
        </span>
        <button
          type="button"
          onClick={() => setMinimised((value) => !value)}
          aria-label={minimised ? "Expand" : "Minimise"}
          className="ml-auto rounded p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <MinimiseIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>

      {!minimised && (
        <>
          {error && (
            <div
              className="border-b border-line px-4 py-3"
              style={{ background: "oklch(0.68 0.16 18 / 0.09)" }}
            >
              <p className="text-[12.5px] font-semibold">Could not send</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink3">{error} The draft is safe.</p>
            </div>
          )}

          <div className="relative flex items-center gap-3 border-b border-line px-4 py-2.5">
            <span className="w-[52px] flex-none font-mono text-[10.5px] text-ink3">From</span>
            <button
              type="button"
              onClick={() => setPicking((value) => !value)}
              className="flex items-center gap-2 rounded-lg bg-chip px-2.5 py-1.5 text-[12.5px] transition-colors hover:bg-hover"
            >
              <span className="size-[7px] rounded-full" style={{ background: addressColor(from) }} />
              <span className="font-mono">{from || "no address yet"}</span>
              <ChevronDownIcon className="size-3 text-ink3" />
            </button>

            {picking && (
              <div className="animate-pop-in absolute top-full left-[68px] z-10 w-[290px] rounded-xl border border-line bg-panel2 p-1.5 backdrop-blur-[30px] [box-shadow:var(--dialog-shadow)]">
                {accounts.map((account) => (
                  <button
                    key={account}
                    type="button"
                    onClick={() => {
                      setFrom(account);
                      setPicking(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <span
                      className="size-[7px] flex-none rounded-full"
                      style={{ background: addressColor(account) }}
                    />
                    <span className="truncate font-mono text-[12px]">{account}</span>
                  </button>
                ))}
                {accounts.length === 0 && (
                  <p className="px-2.5 py-2 text-[12px] text-ink3">
                    Add an address in Settings first.
                  </p>
                )}
              </div>
            )}
          </div>

          <Field label="To" value={to} onChange={setTo} placeholder="name@example.com" mono />
          <Field label="Subj" value={subject} onChange={setSubject} placeholder="Subject" />

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your message"
            className="h-32 w-full resize-none bg-transparent px-4 py-3 text-[13.5px] leading-[1.7] outline-none placeholder:text-ink3"
          />

          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={send}
              disabled={state === "sending" || !text.trim() || !from}
              className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-btn-ink disabled:opacity-50"
              style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
            >
              {state === "sending" && (
                <span className="animate-spin-slow size-3 rounded-full border-2 border-white/40 border-t-white" />
              )}
              {state === "sending" ? "Sending" : state === "failed" ? "Retry send" : "Send"}
            </button>

            {saved && (
              <span className="ml-auto font-mono text-[10.5px] text-ink3">draft saved</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-line px-4 py-2.5">
      <span className="w-[52px] flex-none font-mono text-[10.5px] text-ink3">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent text-[12.5px] outline-none placeholder:text-ink3 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function Toast({ from, id, onClose }: { from: string; id: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="animate-dock-in absolute right-6 bottom-6 z-20 flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 backdrop-blur-[28px] [box-shadow:var(--toast-shadow)]">
      <span className="size-[7px] flex-none rounded-full bg-accent" />
      <span>
        <span className="block text-[12.5px] font-semibold">Sent from {from}</span>
        <span className="block font-mono text-[10.5px] text-ink3">queued with Resend · {id}</span>
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="rounded p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}
