"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { saveOrder } from "@/app/(mail)/settings/actions";
import {
  ArchiveIcon,
  ChevronIcon,
  DraftIcon,
  GripIcon,
  InboxIcon,
  MoreIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  TrashIcon,
} from "@/components/icons";
import { addressColor, initials, localPart } from "@/lib/mail/identity";
import { FailedMail } from "./FailedMail";
import { Switcher } from "./Switcher";
import type { Inbox, Rail as RailData, Switcher as SwitcherData } from "@/lib/mail/queries";

interface Props extends RailData {
  // Messages ingest gave up on. They are invisible in the lists, so the only
  // place they can be reported is here.
  failed: number;
  user: string;
  loadedAt: string;
  collapsed: boolean;
  switcher: SwitcherData;
  choice: string | null;
  owner: boolean;
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
  trashed,
  failed,
  user,
  loadedAt,
  collapsed,
  switcher,
  choice,
  owner,
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

      <Switcher data={switcher} choice={choice} owner={owner} />

      {failed > 0 && <FailedMail count={failed} canRetry={owner} />}

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
        <BoxRow href="/b/trash" label="Trash" count={trashed} active={path === "/b/trash"}>
          <TrashIcon className="size-4" />
        </BoxRow>
      </nav>

      {/* A one-address view is already that address, so it has no list. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 scroll-clean">
        {choice === null && named.length > 0 && (
          <section>
            <GroupLabel action={owner ? { href: "/settings", label: "Add an address" } : undefined}>
              Addresses
            </GroupLabel>
            {owner ? (
              <NamedAddresses named={named} path={path} />
            ) : (
              named.map((inbox) => <AddressRow key={inbox.address} inbox={inbox} path={path} named />)
            )}
          </section>
        )}

        {choice === null && catchAll.length > 0 && (
          <section>
            <GroupLabel>Catch-all · new</GroupLabel>
            {catchAll.map((inbox) => (
              <AddressRow key={inbox.address} inbox={inbox} path={path} />
            ))}
          </section>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {owner && (
          <Link
            href="/settings"
            className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line text-[12.5px] text-ink3 transition-colors hover:bg-hover hover:text-ink2"
          >
            <PlusIcon className="size-3.5" />
            New address
          </Link>
        )}

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
  trashed,
  user,
  collapsed,
  switcher,
  choice,
  owner,
}: Props) {
  const path = usePathname();
  const expand = useCollapse(collapsed);

  return (
    // Raised so the switcher's menu, which opens to the side, sits over the list.
    <aside className="relative z-10 flex w-[64px] flex-none flex-col items-center gap-3.5 border-r border-line bg-rail py-4 backdrop-blur-[20px]">
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

      <Switcher data={switcher} choice={choice} owner={owner} compact />

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
        <BoxTarget href="/b/trash" title="Trash" count={trashed} active={path === "/b/trash"}>
          <TrashIcon className="size-3.5" />
        </BoxTarget>
      </nav>

      {choice === null && <span className="h-px w-6 flex-none bg-line" />}

      <div className="flex min-h-0 flex-1 flex-col gap-[5px] scroll-clean">
        {choice === null && (
          <>
            {named.map((inbox) => (
              <AddressTarget key={inbox.address} inbox={inbox} path={path} named />
            ))}
            {catchAll.map((inbox) => (
              <AddressTarget key={inbox.address} inbox={inbox} path={path} />
            ))}
          </>
        )}
      </div>

      {owner && (
        <Link
          href="/settings"
          title="New address"
          aria-label="New address"
          className="flex size-[34px] flex-none items-center justify-center rounded-[11px] border border-dashed border-line text-ink3 transition-colors hover:bg-hover hover:text-ink2"
        >
          <PlusIcon className="size-3.5" />
        </Link>
      )}

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

interface Drag {
  from: number;
  to: number;
  startY: number;
  dy: number;
  row: number;
}

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// While dragging, the rows only slide out of the way. Reordering the DOM would
// move the grip holding the pointer capture, and the release would be lost.
function offset(drag: Drag | null, index: number) {
  if (!drag) return 0;
  if (index === drag.from) return drag.dy;
  if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.row;
  if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.row;
  return 0;
}

function NamedAddresses({ named, path }: { named: Inbox[]; path: string }) {
  const [order, setOrder] = useOptimistic(named);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, startTransition] = useTransition();
  // Pointer moves render at a lower priority, so by the time the button comes
  // up the state can still hold an older position. The ref is always current.
  const live = useRef<Drag | null>(null);

  function track(next: Drag | null) {
    live.current = next;
    setDrag(next);
  }

  function commit(next: Inbox[]) {
    startTransition(async () => {
      setOrder(next);
      await saveOrder(next.map((inbox) => inbox.address));
    });
  }

  function step(index: number, by: number) {
    const to = index + by;
    if (to >= 0 && to < order.length) commit(move(order, index, to));
  }

  return order.map((inbox, index) => (
    <AddressRow
      key={inbox.address}
      inbox={inbox}
      path={path}
      named
      shift={offset(drag, index)}
      lifted={drag?.from === index}
      grip={{
        onPointerDown(event) {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const row = event.currentTarget.parentElement!.getBoundingClientRect().height;
          track({ from: index, to: index, startY: event.clientY, dy: 0, row });
        },
        onPointerMove(event) {
          const current = live.current;
          if (!current) return;
          const dy = event.clientY - current.startY;
          const to = Math.min(Math.max(current.from + Math.round(dy / current.row), 0), order.length - 1);
          track({ ...current, dy, to });
        },
        onPointerUp() {
          const current = live.current;
          if (current && current.to !== current.from) commit(move(order, current.from, current.to));
          track(null);
        },
        onPointerCancel() {
          track(null);
        },
        onKeyDown(event) {
          if (event.key === "ArrowUp") step(index, -1);
          else if (event.key === "ArrowDown") step(index, 1);
          else return;
          event.preventDefault();
        },
      }}
    />
  ));
}

type GripHandlers = Pick<
  React.ComponentProps<"button">,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onKeyDown"
>;

function AddressRow({
  inbox,
  path,
  named = false,
  grip,
  shift = 0,
  lifted = false,
}: {
  inbox: Inbox;
  path: string;
  named?: boolean;
  grip?: GripHandlers;
  shift?: number;
  lifted?: boolean;
}) {
  const href = `/a/${encodeURIComponent(inbox.address)}`;
  const active = path === href;
  const color = addressColor(inbox.address, inbox.hue, named);

  // The settings link is a sibling rather than a child, because a link inside
  // a link is invalid and the inner one stops working.
  const name = inbox.label ?? localPart(inbox.address);

  return (
    <div
      className={`group relative ${
        lifted ? "z-10 rounded-[10px] bg-panel2 shadow-lg" : "transition-transform duration-150"
      }`}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
    >
      <Link
        href={href}
        aria-label={`${name} (${inbox.address})`}
        className={`flex items-center gap-2.5 rounded-[10px] border py-2 pr-9 pl-2.5 transition-colors ${
          active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-hover"
        }`}
      >
        <span
          className={`size-[7px] flex-none rounded-full ${named ? "" : "border border-dashed"} ${
            grip ? "group-hover:opacity-0 group-has-focus-visible:opacity-0" : ""
          }`}
          style={named ? { background: color } : { borderColor: "var(--ink3)" }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink2">
            {name}
          </span>
          <span className="block truncate font-mono text-[10px] text-ink3">{inbox.address}</span>
        </span>
        {inbox.unread > 0 && (
          <span className="flex-none font-mono text-[10px] text-ink3">{inbox.unread}</span>
        )}
      </Link>

      {/* Sits over the colour dot. Invisible until hovered, and it ignores the
          pointer until then too, so a tap on a phone still opens the address. */}
      {grip && (
        <button
          type="button"
          aria-label={`Move ${name} up or down`}
          {...grip}
          className="pointer-events-none absolute top-1/2 left-[5px] flex h-6 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-ink3 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripIcon className="size-3" />
        </button>
      )}

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
