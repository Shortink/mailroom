import Link from "next/link";
import { ChevronIcon, EnvelopeIcon, PenIcon } from "@/components/icons";
import { listInboxes } from "@/lib/mail/queries";

export const dynamic = "force-dynamic";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const { pinned, otherCount, unread } = await listInboxes();

  return (
    <div className="grid h-dvh grid-cols-[196px_1fr]">
      <aside className="flex flex-col border-r border-rule bg-panel">
        <div className="flex h-11 items-center gap-2 border-b border-rule px-3.5 text-[13px] font-semibold tracking-[-0.01em]">
          <EnvelopeIcon className="text-accent" />
          Mailroom
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          <Link
            href="/compose"
            className="mt-0.5 mb-2.5 flex h-[30px] items-center justify-center gap-1.5 rounded-md bg-accent text-[13px] font-semibold text-accent-ink"
          >
            <PenIcon />
            Compose
          </Link>

          <InboxLink href="/" label="All mail" count={unread} />

          <div className="px-2 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            Inboxes
          </div>

          {pinned.map((inbox) => (
            <InboxLink
              key={inbox.address}
              href={`/?address=${encodeURIComponent(inbox.address)}`}
              label={inbox.label ?? inbox.address.split("@")[0] + "@"}
              count={inbox.unread}
            />
          ))}

          {otherCount > 0 && (
            <Link
              href="/?all=1"
              className="mt-1 flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-ink-3 transition-colors hover:bg-hover"
            >
              <ChevronIcon className="opacity-75" />
              More
              <span className="ml-auto font-mono text-[11px]">{otherCount}</span>
            </Link>
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}

function InboxLink({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-ink-2 transition-colors hover:bg-hover"
    >
      {label}
      {count > 0 && <span className="ml-auto font-mono text-[11px] text-ink-3">{count}</span>}
    </Link>
  );
}
