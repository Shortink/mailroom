"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { addressColor } from "@/lib/mail/identity";

export interface DraftItem {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  time: string;
  isReply: boolean;
}

export function DraftList({ items }: { items: DraftItem[] }) {
  const path = usePathname();

  return (
    <div className="flex w-full flex-none flex-col border-r border-line bg-panel backdrop-blur-[22px] md:w-[374px]">
      <header className="flex-none border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 flex-none rounded-full bg-accent" />
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Drafts</h2>
          <span className="ml-auto font-mono text-[10.5px] text-ink3">
            {items.length} {items.length === 1 ? "draft" : "drafts"}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-ink3">not sent yet</p>
      </header>

      {items.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="size-8 rotate-45 rounded-[9px] border border-line" />
          <p className="text-[14px] font-semibold">No drafts</p>
          <p className="text-[12.5px] text-ink3">
            Anything you start writing is kept here until you send it.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 scroll-clean">
          {items.map((item) => {
            const selected = path === `/d/${item.id}`;

            return (
              <Link
                key={item.id}
                href={`/d/${item.id}`}
                aria-label={`Draft to ${item.to || "nobody"}: ${item.subject || "no subject"}`}
                className={`relative flex flex-col gap-0.5 border-b border-line2 px-4 py-[13px] transition-colors ${
                  selected ? "bg-accent-soft" : "hover:bg-hover"
                }`}
              >
                {selected && (
                  <span
                    className="absolute inset-y-0 left-0 w-0.5"
                    style={{ background: addressColor(item.from) }}
                  />
                )}

                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold">
                    {item.to || "No recipient"}
                  </span>
                  <span className="flex-none rounded border border-line px-1.5 py-px font-mono text-[9.5px] text-ink3 uppercase">
                    {item.isReply ? "reply" : "draft"}
                  </span>
                  <span className="ml-auto flex-none font-mono text-[10.5px] text-ink3">
                    {item.time}
                  </span>
                </span>

                <span className="truncate text-[13px] text-ink2">
                  {item.subject || "(no subject)"}
                </span>

                {item.preview && (
                  <span className="truncate text-[12.5px] text-ink3">{item.preview}</span>
                )}

                <span className="mt-1 flex items-center gap-1.5">
                  <span
                    className="size-[5px] flex-none rounded-full"
                    style={{ background: addressColor(item.from) }}
                  />
                  <span className="truncate font-mono text-[10px] text-ink3">
                    from {item.from || "no address"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <footer className="flex-none border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-ink3">
        drafts are stored on this instance only
      </footer>
    </div>
  );
}
