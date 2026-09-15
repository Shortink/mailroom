"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ChevronIcon,
  DraftIcon,
  InboxIcon,
  MoreIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
} from "@/components/icons";
import { addressColor, initials, localPart } from "@/lib/mail/identity";
import { FailedMail } from "./FailedMail";
import type { Inbox, Rail as RailData } from "@/lib/mail/queries";

interface Props extends RailData {
  // Messages ingest gave up on. They are invisible in the lists, so the only
  // place they can be reported is here.
  failed: number;
  user: string;
  loadedAt: string;
  collapsed: boolean;
}

function useCollapse(collapsed: boolean) {
  const router = useRouter();

  return () => {
    const next = collapsed ? "open" : "closed";
    document.cookie = `rail=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
}

export function Rail(props: Props) {
  return props.collapsed ? <NarrowRail {...props} /> : <WideRail {...props} />;
}

function WideRail({
  named,
  catchAll,
  unread,
  sent,
  drafts,
  archived,
  failed,
  user,
  loadedAt,
  collapsed,
}: Props) {
  const path = usePathname();
  const collapse = useCollapse(collapsed);

  return (
    <aside className="flex w-[238px] flex-none flex-col gap-4 border-r border-line bg-rail px-3 py-4 backdrop-blur-[20px]">
      <header className="flex items-center gap-2.5 px-1">
        <span
          className="size-[26px] flex-none rotate-45 rounded-[7px]"
          style={{ background: "var(--brand)" }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">Mailroom</span>
          <span className="block font-mono text-[10px] text-ink3">self-hosted</span>
        </span>
        <button
          type="button"
          onClick={collapse}
          aria-label="Collapse the sidebar"
          className="flex size-[26px] flex-none items-center justify-center rounded-lg text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <ChevronIcon className="size-3.5 rotate-180" />
        </button>
      </header>

      {failed > 0 && <FailedMail count={failed} />}

      <nav className="flex flex-col gap-0.5">
        <BoxRow href="/" label="All mail" count={unread} active={path === "/"}>
          <InboxIcon className="size-4" />
        </BoxRow>
        <BoxRow href="/b/sent" label="Sent" count={sent} active={path === "/b/sent"}>
          <SendIcon className="size-4" />
        </BoxRow>
        <BoxRow href="/b/drafts" label="Drafts" count={drafts} active={path === "/b/drafts"}>
          <DraftIcon className="size-4" />
        </BoxRow>
        <BoxRow href="/b/archive" label="Archive" count={archived} active={path === "/b/archive"}>
          <ArchiveIcon className="size-4" />
        </BoxRow>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-4 scroll-clean">
        {named.length > 0 && (
          <section>
            <GroupLabel action={{ href: "/settings", label: "Add an address" }}>
              Addresses
            </GroupLabel>
            {named.map((inbox) => (
              <AddressRow key={inbox.address} inbox={inbox} path={path} named />
            ))}
          </section>
        )}

        {catchAll.length > 0 && (
          <section>
            <GroupLabel>Catch-all · new</GroupLabel>
            {catchAll.map((inbox) => (
              <AddressRow key={inbox.address} inbox={inbox} path={path} />
            ))}
          </section>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/settings"
          className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line text-[12.5px] text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <PlusIcon className="size-3.5" />
          New address
        </Link>

        <div className="flex items-center gap-2.5 px-1">
          <span
            className="flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials(null, user)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px]">{user}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink3">
              <span className="size-[5px] rounded-full bg-ok" />
              loaded {loadedAt}
            </span>
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex-none rounded-md p-1 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
          >
            <SettingsIcon className="size-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function GroupLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-center justify-between px-2.5 pb-1.5">
      <span className="font-mono text-[10px] tracking-[0.1em] text-ink3 uppercase">{children}</span>
      {action && (
        <Link
          href={action.href}
          aria-label={action.label}
          className="rounded p-0.5 text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <PlusIcon className="size-3" />
        </Link>
      )}
    </div>
  );
}

// Nothing is written down here, so every target is a glyph and its title is the
// only label it has.
function NarrowRail({
  named,
  catchAll,
  unread,
  sent,
  drafts,
  archived,
  user,
  collapsed,
}: Props) {
  const path = usePathname();
  const expand = useCollapse(collapsed);

  return (
    <aside className="flex w-[64px] flex-none flex-col items-center gap-3.5 border-r border-line bg-rail py-4 backdrop-blur-[20px]">
      <span
        className="size-[26px] flex-none rotate-45 rounded-[7px]"
        style={{ background: "var(--brand)" }}
      />

      <button
        type="button"
        onClick={expand}
        aria-label="Expand the sidebar"
        className="flex h-9 w-10 items-center justify-center rounded-[11px] text-ink3 transition-colors hover:bg-hover hover:text-ink2"
      >
        <ChevronIcon className="size-3.5" />
      </button>

      <nav className="flex flex-col gap-[5px]">
        <BoxTarget href="/" title="All mail" count={unread} active={path === "/"}>
          <InboxIcon className="size-3.5" />
        </BoxTarget>
        <BoxTarget href="/b/sent" title="Sent" count={sent} active={path === "/b/sent"}>
          <SendIcon className="size-3.5" />
        </BoxTarget>
        <BoxTarget href="/b/drafts" title="Drafts" count={drafts} active={path === "/b/drafts"}>
          <DraftIcon className="size-3.5" />
        </BoxTarget>
        <BoxTarget
          href="/b/archive"
          title="Archive"
          count={archived}
          active={path === "/b/archive"}
        >
          <ArchiveIcon className="size-3.5" />
        </BoxTarget>
      </nav>

      <span className="h-px w-6 flex-none bg-line" />

      <div className="flex min-h-0 flex-1 flex-col gap-[5px] scroll-clean">
        {named.map((inbox) => (
          <AddressTarget key={inbox.address} inbox={inbox} path={path} named />
        ))}
        {catchAll.map((inbox) => (
          <AddressTarget key={inbox.address} inbox={inbox} path={path} />
        ))}
      </div>

      <Link
        href="/settings"
        title="New address"
        aria-label="New address"
        className="flex size-[34px] flex-none items-center justify-center rounded-[11px] border border-dashed border-line text-ink3 transition-colors hover:bg-hover hover:text-ink2"
      >
        <PlusIcon className="size-3.5" />
      </Link>

      <Link
        href="/settings"
        title={user}
        aria-label={`Signed in as ${user}`}
        className="flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ background: "var(--brand)" }}
      >
        {initials(null, user)}
      </Link>
    </aside>
  );
}

function BoxTarget({
  href,
  title,
  count,
  active,
  children,
}: {
  href: string;
  title: string;
  count: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      className={`relative flex h-9 w-10 items-center justify-center rounded-[11px] border transition-colors ${
        active ? "border-accent bg-accent-soft text-ink" : "border-transparent text-ink2 hover:bg-hover"
      }`}
    >
      {children}
      {count > 0 && <Badge count={count} />}
    </Link>
  );
}

function AddressTarget({ inbox, path, named = false }: { inbox: Inbox; path: string; named?: boolean }) {
  const href = `/a/${encodeURIComponent(inbox.address)}`;
  const label = named
    ? `${inbox.label ?? localPart(inbox.address)} — ${inbox.address}`
    : `Catch-all — ${inbox.address}`;

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`relative flex h-9 w-10 items-center justify-center rounded-[11px] border transition-colors ${
        path === href ? "border-accent bg-accent-soft" : "border-transparent hover:bg-hover"
      }`}
    >
      {named ? (
        <span
          className="flex size-[26px] items-center justify-center rounded-full font-mono text-[11px] font-medium uppercase"
          style={{
            background: addressColor(inbox.address, inbox.hue, true),
            color: "oklch(0.2 0.02 var(--h))",
          }}
        >
          {localPart(inbox.address).slice(0, 1)}
        </span>
      ) : (
        <span className="flex size-[26px] items-center justify-center rounded-full border border-dashed border-ink3 font-mono text-[11px] text-ink3">
          ?
        </span>
      )}
      {inbox.unread > 0 && <Badge count={inbox.unread} />}
    </Link>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full border border-line bg-panel2 px-1 text-center font-mono text-[10px] text-ink2">
      {count}
    </span>
  );
}

function BoxRow({
  href,
  label,
  count,
  active,
  children,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-[13px] transition-colors ${
        active
          ? "border-accent bg-accent-soft text-ink"
          : "border-transparent text-ink2 hover:bg-hover"
      }`}
    >
      <span className="text-ink3">{children}</span>
      {label}
      {count > 0 && <span className="ml-auto font-mono text-[10px] text-ink3">{count}</span>}
    </Link>
  );
}

function AddressRow({
  inbox,
  path,
  named = false,
}: {
  inbox: Inbox;
  path: string;
  named?: boolean;
}) {
  const href = `/a/${encodeURIComponent(inbox.address)}`;
  const active = path === href;
  const color = addressColor(inbox.address, inbox.hue, named);

  // The settings link is a sibling rather than a child, because a link inside
  // a link is invalid and the inner one stops working.
  return (
    <div className="group relative">
      <Link
        href={href}
        aria-label={`${inbox.label ?? localPart(inbox.address)} (${inbox.address})`}
        className={`flex items-center gap-2.5 rounded-[10px] border py-2 pr-9 pl-2.5 transition-colors ${
          active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-hover"
        }`}
      >
        <span
          className={`size-[7px] flex-none rounded-full ${named ? "" : "border border-dashed"}`}
          style={named ? { background: color } : { borderColor: "var(--ink3)" }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink2">
            {inbox.label ?? localPart(inbox.address)}
          </span>
          <span className="block truncate font-mono text-[10px] text-ink3">{inbox.address}</span>
        </span>
        {inbox.unread > 0 && (
          <span className="flex-none font-mono text-[10px] text-ink3">{inbox.unread}</span>
        )}
      </Link>

      <Link
        href={`/settings/${encodeURIComponent(inbox.address)}`}
        aria-label={`Settings for ${inbox.address}`}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-ink3 opacity-0 transition-opacity hover:bg-hover hover:text-ink2 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <MoreIcon className="size-3.5" />
      </Link>
    </div>
  );
}
