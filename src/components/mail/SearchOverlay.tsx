"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchMail, type SearchHit, type SearchScope } from "@/app/(mail)/actions";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { addressColor } from "@/lib/mail/identity";

const SCOPES: { key: keyof SearchScope; label: string }[] = [
  { key: "unread", label: "unread" },
  { key: "recent", label: "last 30 days" },
  { key: "attachments", label: "has attachment" },
];

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>({
    unread: false,
    recent: false,
    attachments: false,
  });
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    input.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setHits(await searchMail(query, scope));
      setSearched(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, scope]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 backdrop-blur-[7px]"
      style={{ background: "oklch(0.2 0.01 258 / 0.42)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search mail"
        onClick={(event) => event.stopPropagation()}
        className="animate-pop-in mx-auto mt-16 flex max-h-[70vh] w-[740px] flex-col overflow-hidden rounded-2xl border border-line bg-panel2 backdrop-blur-[30px] [box-shadow:var(--dialog-shadow)]"
      >
        <div className="flex flex-none items-center gap-3 border-b border-line px-5 py-4">
          <SearchIcon className="size-4 flex-none text-ink3" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search every address"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink3"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex-none rounded p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>

        <div className="flex flex-none gap-1.5 border-b border-line px-5 py-3">
          {SCOPES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope((current) => ({ ...current, [key]: !current[key] }))}
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                scope[key]
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line text-ink3 hover:bg-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 scroll-clean">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => {
                router.push(`/t/${hit.id}`);
                onClose();
              }}
              className="flex w-full items-center gap-3 border-b border-line2 px-5 py-3 text-left transition-colors hover:bg-hover"
            >
              <span
                className="size-[7px] flex-none rounded-full"
                style={{ background: addressColor(hit.address ?? "") }}
              />
              <span className="w-[150px] flex-none truncate text-[13px] font-semibold">
                {hit.sender}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink2">
                <Highlight text={hit.subject} match={query} />
              </span>
              <span className="flex-none font-mono text-[10.5px] text-ink3">{hit.address}</span>
              <span className="w-[52px] flex-none text-right font-mono text-[10.5px] text-ink3">
                {hit.time}
              </span>
            </button>
          ))}

          {searched && hits.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-ink3">
              Nothing matches that search.
            </p>
          )}
        </div>

        {searched && (
          <footer className="flex-none border-t border-line px-5 py-2.5 font-mono text-[10.5px] text-ink3">
            {hits.length} {hits.length === 1 ? "result" : "results"} · searching every address,
            including catch-all
          </footer>
        )}
      </div>
    </div>
  );
}

// The matched run is marked in place so the eye lands on why a row is here.
function Highlight({ text, match }: { text: string; match: string }) {
  const needle = match.trim();
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-accent-soft px-0.5 text-ink">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
