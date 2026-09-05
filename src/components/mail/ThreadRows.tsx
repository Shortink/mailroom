"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipIcon } from "@/components/icons";

export interface ListItem {
  id: string;
  sender: string;
  initials: string;
  time: string;
  subject: string;
  snippet: string;
  address: string | null;
  addressColor: string;
  addressPrefix: string;
  unread: boolean;
  hasAttachment: boolean;
}

export function ThreadRows({ items }: { items: ListItem[] }) {
  const path = usePathname();

  return (
    <div className="min-h-0 flex-1 scroll-clean">
      {items.map((item) => {
        const selected = path === `/t/${item.id}`;

        return (
          <Link
            key={item.id}
            href={`/t/${item.id}`}
            aria-label={`${item.sender}: ${item.subject}${item.unread ? " (unread)" : ""}`}
            className={`relative flex gap-3 border-b border-line2 px-4 py-[13px] transition-colors ${
              selected ? "bg-accent-soft" : "hover:bg-hover"
            }`}
          >
            {selected && (
              <span
                className="absolute inset-y-0 left-0 w-0.5"
                style={{ background: item.addressColor }}
              />
            )}

            <span
              className="flex size-[30px] flex-none items-center justify-center rounded-full text-[10.5px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              {item.initials}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span
                  className={`truncate text-[13.5px] ${item.unread ? "font-semibold text-ink" : "font-medium text-ink2"}`}
                >
                  {item.sender}
                </span>
                {item.unread && <span className="size-1.5 flex-none rounded-full bg-accent" />}
                {item.hasAttachment && <ClipIcon className="size-3 flex-none text-ink3" />}
                <span className="ml-auto flex-none font-mono text-[10.5px] text-ink3">
                  {item.time}
                </span>
              </span>

              <span className="mt-0.5 block truncate text-[13px] text-ink2">{item.subject}</span>

              {item.snippet && (
                <span className="mt-0.5 block truncate text-[12.5px] text-ink3">
                  {item.snippet}
                </span>
              )}

              {item.address && (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className="size-[5px] flex-none rounded-full"
                    style={{ background: item.addressColor }}
                  />
                  <span className="truncate font-mono text-[10px] text-ink3">
                    {item.addressPrefix}
                    {item.address}
                  </span>
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
