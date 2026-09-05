"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { archiveThread } from "@/app/(mail)/actions";
import { useCompose } from "./Compose";

interface Props {
  threadId: string;
  archived: boolean;
  replyFrom: string;
  replyTo: string;
  replySubject: string;
}

export function ThreadActions({ threadId, archived, replyFrom, replyTo, replySubject }: Props) {
  const compose = useCompose();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const draft = { threadId, from: replyFrom, to: replyTo, subject: replySubject };

  return (
    <div className="ml-auto flex flex-none items-center gap-2">
      <button
        type="button"
        onClick={() => compose.open(draft)}
        className="rounded-[10px] px-3.5 py-1.5 text-[12.5px] font-semibold text-btn-ink"
        style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
      >
        Reply
      </button>

      <button
        type="button"
        onClick={() => {
          startTransition(async () => {
            await archiveThread(threadId, !archived);
            // Archiving takes the thread out of the list it was read from.
            if (!archived) router.push("/");
          });
        }}
        disabled={pending}
        className="rounded-[10px] border border-line px-3.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:bg-hover disabled:opacity-50"
      >
        {archived ? "Unarchive" : "Archive"}
      </button>
    </div>
  );
}

export function QuickReply({
  threadId,
  replyFrom,
  replyTo,
  replySubject,
  initials,
}: Omit<Props, "archived"> & { initials: string }) {
  const compose = useCompose();

  return (
    <button
      type="button"
      onClick={() => compose.open({ threadId, from: replyFrom, to: replyTo, subject: replySubject })}
      className="mt-2 flex w-full items-center gap-3 rounded-[14px] border border-line bg-chip px-4 py-3 text-left transition-colors hover:bg-hover"
    >
      <span
        className="flex size-[26px] flex-none items-center justify-center rounded-full text-[9px] font-semibold text-white"
        style={{ background: "var(--brand)" }}
      >
        {initials}
      </span>
      <span className="flex-1 truncate text-[13px] text-ink3">
        Reply to {replyTo} as {replyFrom}
      </span>
      <span className="flex-none rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-ink3">
        open composer
      </span>
    </button>
  );
}
