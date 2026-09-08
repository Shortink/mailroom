import Link from "next/link";
import { formatWhen, snippet } from "@/lib/format";
import { addressColor, initials, localPart } from "@/lib/mail/identity";
import { listThreads, type Box } from "@/lib/mail/queries";
import { SearchField } from "./SearchField";
import { ThreadRows, type ListItem } from "./ThreadRows";

const TITLES: Record<Box, string> = {
  inbox: "All mail",
  sent: "Sent",
  archive: "Archive",
};

interface Props {
  box?: Box;
  address?: string;
  unreadOnly?: boolean;
}

export async function ThreadList({ box = "inbox", address, unreadOnly }: Props) {
  const threads = await listThreads({ box, address, unreadOnly });

  const items: ListItem[] = threads.map((thread) => {
    // Sent is identified by the address it left from; everything else by the
    // address it arrived at.
    const shown = box === "sent" ? thread.sentFrom : thread.deliveredTo;

    return {
      id: thread.id,
      sender: thread.fromName ?? thread.from ?? "Unknown sender",
      initials: initials(thread.fromName, thread.from),
      time: formatWhen(thread.lastMessageAt),
      subject: thread.subject || "(no subject)",
      snippet: snippet(thread.snippet, 140),
      address: shown,
      addressColor: shown ? addressColor(shown) : "var(--ink3)",
      addressPrefix: box === "sent" ? "from " : "",
      unread: thread.unread > 0,
      hasAttachment: thread.hasAttachment,
    };
  });

  const title = address ? (localPart(address) ?? address) : TITLES[box];
  const base = address ? `/a/${encodeURIComponent(address)}` : box === "inbox" ? "/" : `/b/${box}`;

  return (
    <div className="flex w-full flex-none flex-col border-r border-line bg-panel backdrop-blur-[22px] md:w-[374px]">
      <header className="flex-none border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 flex-none rounded-full bg-accent" />
          <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          <span className="ml-auto flex-none font-mono text-[10.5px] text-ink3">
            {items.length} {items.length === 1 ? "message" : "messages"}
          </span>
        </div>

        <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink3">
          <span className="truncate">
            {address ?? (box === "inbox" ? "every address that receives here" : TITLES[box])}
          </span>
          {address && (
            <Link
              href={`/settings/${encodeURIComponent(address)}`}
              className="flex-none rounded border border-line px-1.5 py-0.5 text-[10px] transition-colors hover:bg-hover hover:text-ink2"
            >
              manage
            </Link>
          )}
        </p>

        <SearchField />

        <div className="mt-2.5 flex gap-1.5">
          <FilterPill href={base} active={!unreadOnly}>
            All
          </FilterPill>
          <FilterPill href={`${base}?filter=unread`} active={Boolean(unreadOnly)}>
            Unread
          </FilterPill>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyList unreadOnly={unreadOnly} address={address} base={base} />
      ) : (
        <ThreadRows items={items} />
      )}

      <footer className="flex-none border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-ink3">
        catch-all on · mail to any address arrives here
      </footer>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
        active ? "border-accent bg-accent-soft text-ink" : "border-line text-ink3 hover:bg-hover"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyList({
  unreadOnly,
  address,
  base,
}: {
  unreadOnly?: boolean;
  address?: string;
  base: string;
}) {
  const where = address ? `at ${address}` : "here";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <span className="size-8 rotate-45 rounded-[9px] border border-line" />

      {unreadOnly ? (
        <>
          <p className="text-[14px] font-semibold">Nothing unread here</p>
          <p className="text-[12.5px] text-ink3">Everything {where} has been read.</p>
          <Link
            href={base}
            className="mt-1 rounded-full border border-line px-3 py-1 text-[12px] text-ink2 transition-colors hover:bg-hover"
          >
            show all mail
          </Link>
        </>
      ) : (
        <>
          <p className="text-[14px] font-semibold">Nothing has arrived yet</p>
          <p className="text-[12.5px] text-ink3">
            Any address on the domain works straight away. Send something {where} and it shows up in
            a few seconds.
          </p>
        </>
      )}
    </div>
  );
}
