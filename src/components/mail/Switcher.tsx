"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setView } from "@/app/(mail)/actions";
import { ChevronDownIcon } from "@/components/icons";
import { addressColor, localPart } from "@/lib/mail/identity";
import type { Switcher as SwitcherData, ViewEntry } from "@/lib/mail/queries";

export function Switcher({
  data,
  choice,
  owner,
  compact = false,
}: {
  data: SwitcherData;
  choice: string | null;
  owner: boolean;
  // The 64px rail has room for a glyph only, so the menu opens to the side.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // A member with one address has nothing to switch between.
  if (!owner && data.own.length < 2) return null;

  const all = owner ? "All mine" : "All";
  const current = [...data.own, ...data.members].find((entry) => entry.address === choice);
  const name = choice === null ? all : (current?.label ?? choice);

  function choose(value: string) {
    setOpen(false);
    startTransition(() => setView(value));
  }

  return (
    <div ref={root} className={`relative flex-none transition-opacity ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Choose whose mail to show"
        aria-expanded={open}
        aria-haspopup="true"
        title={compact ? name : undefined}
        className={
          compact
            ? "flex h-9 w-10 items-center justify-center rounded-[11px] border border-transparent transition-colors hover:bg-hover"
            : "flex w-full items-center gap-2.5 rounded-[10px] border border-line px-2.5 py-2 text-left transition-colors hover:bg-hover"
        }
      >
        {compact ? (
          <ViewGlyph choice={choice} entry={current} />
        ) : (
          <>
            <Dot choice={choice} entry={current} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink2">{name}</span>
            <ChevronDownIcon className="size-3.5 flex-none text-ink3" />
          </>
        )}
      </button>

      {open && (
        <div
          className={`animate-pop-in absolute z-20 rounded-xl border border-line bg-panel2 p-1.5 backdrop-blur-[30px] [box-shadow:var(--dialog-shadow)] ${
            compact ? "top-0 left-full ml-2 w-[260px]" : "inset-x-0 top-full mt-1"
          }`}
        >
          <Entry label={all} unread={data.allUnread} current={choice === null} onChoose={() => choose("all")} />
          {data.own.map((entry) => (
            <AddressEntry
              key={entry.address}
              entry={entry}
              current={choice === entry.address}
              onChoose={choose}
            />
          ))}
          {data.members.length > 0 && (
            <>
              <p className="mt-1.5 border-t border-line px-2.5 pt-2.5 pb-1 font-mono text-[10px] tracking-[0.1em] text-ink3 uppercase">
                Members
              </p>
              {data.members.map((entry) => (
                <AddressEntry
                  key={entry.address}
                  entry={entry}
                  current={choice === entry.address}
                  onChoose={choose}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Dot({ choice, entry }: { choice: string | null; entry?: ViewEntry }) {
  if (choice === null) {
    return <span className="size-[7px] flex-none rounded-full" style={{ background: "var(--brand)" }} />;
  }
  return (
    <span
      className="size-[7px] flex-none rounded-full"
      style={{ background: addressColor(choice, entry?.hue) }}
    />
  );
}

function ViewGlyph({ choice, entry }: { choice: string | null; entry?: ViewEntry }) {
  if (choice === null) {
    return (
      <span className="flex size-[26px] items-center justify-center rounded-full border border-line bg-chip font-mono text-[9px] text-ink2">
        all
      </span>
    );
  }
  return (
    <span
      className="flex size-[26px] items-center justify-center rounded-full font-mono text-[11px] font-medium uppercase"
      style={{ background: addressColor(choice, entry?.hue), color: "oklch(0.2 0.02 var(--h))" }}
    >
      {localPart(choice).slice(0, 1)}
    </span>
  );
}

function AddressEntry({
  entry,
  current,
  onChoose,
}: {
  entry: ViewEntry;
  current: boolean;
  onChoose: (address: string) => void;
}) {
  const detail = entry.members.length > 0 ? entry.members.join(", ") : entry.label ? entry.address : undefined;

  return (
    <Entry
      label={entry.label ?? entry.address}
      detail={detail}
      color={addressColor(entry.address, entry.hue)}
      unread={entry.unread}
      current={current}
      onChoose={() => onChoose(entry.address)}
    />
  );
}

function Entry({
  label,
  detail,
  color,
  unread,
  current,
  onChoose,
}: {
  label: string;
  detail?: string;
  color?: string;
  unread: number;
  current: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-current={current || undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
        current ? "bg-accent-soft" : "hover:bg-hover"
      }`}
    >
      <span
        className="size-[7px] flex-none rounded-full"
        style={{ background: color ?? "var(--brand)" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{label}</span>
        {detail && <span className="block truncate font-mono text-[10px] text-ink3">{detail}</span>}
      </span>
      {unread > 0 && <span className="flex-none font-mono text-[10px] text-ink3">{unread}</span>}
    </button>
  );
}
