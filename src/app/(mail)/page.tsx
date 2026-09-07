import Link from "next/link";
import { ClipIcon, SearchIcon } from "@/components/icons";
import { listThreads } from "@/lib/mail/queries";
import { formatWhen } from "@/lib/format";
import { requireUser } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string; q?: string }>;
}) {
  await requireUser();
  const { address, q } = await searchParams;
  const threads = await listThreads({ address, search: q });

  return (
    <>
      <div className="flex h-11 flex-none items-center gap-2.5 border-b border-rule px-3.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">
          {address ?? "All mail"}
        </span>
        <form action="/" className="ml-auto">
          {address && <input type="hidden" name="address" value={address} />}
          <label className="flex h-[26px] w-[180px] items-center gap-1.5 rounded-md border border-rule px-2 text-xs text-ink-3 focus-within:border-accent">
            <SearchIcon className="size-3" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search"
              className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </label>
        </form>
      </div>

      {threads.length === 0 ? (
        <EmptyInbox address={address} searching={Boolean(q)} />
      ) : (
        <div className="flex-1 overflow-auto">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/t/${thread.id}`}
              className={`grid h-10 grid-cols-[8px_148px_1fr_16px_52px] items-center gap-2.5 border-b border-rule px-3.5 text-[13px] tracking-[-0.008em] transition-colors hover:bg-hover ${
                thread.unread > 0 ? "font-normal" : ""
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${thread.unread > 0 ? "bg-accent" : ""}`}
                aria-label={thread.unread > 0 ? "Unread" : undefined}
              />
              <span
                className={`truncate ${thread.unread > 0 ? "font-medium text-ink" : "text-ink-2"}`}
              >
                {thread.fromName ?? thread.from ?? "Unknown sender"}
              </span>
              <span className={`truncate ${thread.unread > 0 ? "font-semibold" : ""}`}>
                {thread.subject || "(no subject)"}
                {thread.snippet && (
                  <span className="font-normal text-ink-3"> — {thread.snippet}</span>
                )}
              </span>
              <span className="flex justify-center text-ink-3">
                {thread.hasAttachment && <ClipIcon className="size-3" />}
              </span>
              <span className="text-right font-mono text-[11px] whitespace-nowrap text-ink-3">
                {formatWhen(thread.lastMessageAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function EmptyInbox({ address, searching }: { address?: string; searching: boolean }) {
  if (searching) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
        <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.015em]">No matches</h2>
        <p className="max-w-[46ch] text-[13px] leading-relaxed text-ink-3">
          Nothing here matches that search. Try a sender name or a word from the subject.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
      <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.015em]">Nothing here yet</h2>
      <p className="mb-[18px] max-w-[46ch] text-[13px] leading-relaxed text-ink-3">
        Any address at your domain works straight away, with nothing to set up. Send something here
        and it will show up in a few seconds.
      </p>
      {address && (
        <div className="rounded-lg border border-rule bg-well px-3.5 py-2.5 font-mono text-[13px]">
          {address}
        </div>
      )}
    </div>
  );
}
