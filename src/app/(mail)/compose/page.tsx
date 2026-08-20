import { composeAction } from "@/app/(mail)/actions";
import { listInboxes } from "@/lib/mail/queries";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const { pinned } = await listInboxes();
  const sendable = pinned.length > 0 ? pinned : [{ address: "", label: null, unread: 0 }];

  return (
    <>
      <div className="flex h-11 flex-none items-center border-b border-rule px-3.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New message</span>
      </div>

      <form action={composeAction} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto px-5 pt-4">
          <Row label="From">
            <select
              name="from"
              className="rounded-md border border-rule bg-well px-2 py-1 text-[13px] text-ink"
            >
              {sendable.map((inbox) => (
                <option key={inbox.address} value={inbox.address}>
                  {inbox.address || "No address yet"}
                </option>
              ))}
            </select>
          </Row>

          <Row label="To">
            <input
              name="to"
              required
              placeholder="name@example.com"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
          </Row>

          <Row label="Subject">
            <input
              name="subject"
              placeholder="Subject"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
          </Row>

          <textarea
            name="text"
            required
            rows={12}
            placeholder="Write your message"
            className="mt-3.5 w-full max-w-[68ch] resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-rule px-5 py-3">
          <button
            type="submit"
            className="h-7 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-ink"
          >
            Send
          </button>
          <span className="ml-auto text-[11px] text-ink-3">A copy goes to your phone</span>
        </div>
      </form>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-rule py-2.5 text-[13px]">
      <span className="w-[58px] flex-none text-xs text-ink-3">{label}</span>
      {children}
    </div>
  );
}
