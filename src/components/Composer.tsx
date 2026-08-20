import { replyAction } from "@/app/(mail)/actions";

interface Props {
  threadId: string;
  from: string;
  to: string;
  subject: string;
}

export function Composer({ threadId, from, to, subject }: Props) {
  return (
    <form
      action={replyAction}
      className="flex-none border-t border-rule px-5 pt-3 pb-3.5"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="subject" value={subject} />

      <div className="rounded-lg border border-rule bg-well px-3 py-2.5 focus-within:border-accent">
        <p className="mb-1.5 text-xs text-ink-2">
          To {to} · from {from}
        </p>
        <textarea
          name="text"
          rows={3}
          placeholder="Write a reply"
          className="w-full resize-none bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="submit"
          className="h-7 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-ink"
        >
          Send
        </button>
        <span className="ml-auto text-[11px] text-ink-3">A copy goes to your phone</span>
      </div>
    </form>
  );
}
