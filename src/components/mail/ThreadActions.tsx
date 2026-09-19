"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveThread, deleteThread, trashThread } from "@/app/(mail)/actions";
import { useCompose } from "./Compose";

interface Props {
  threadId: string;
  archived: boolean;
  trashed: boolean;
  replyFrom: string;
  replyTo: string;
  replySubject: string;
}

const quiet =
  "rounded-[10px] border border-line px-3.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:bg-hover disabled:opacity-50";

export function ThreadActions({
  threadId,
  archived,
  trashed,
  replyFrom,
  replyTo,
  replySubject,
}: Props) {
  const compose = useCompose();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const draft = { threadId, from: replyFrom, to: replyTo, subject: replySubject };

  function run(action: () => Promise<void>, then?: string) {
    startTransition(async () => {
      await action();
      if (then) router.push(then);
    });
  }

  if (trashed) {
    return (
      <div className="ml-auto flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={() => run(() => trashThread(threadId, false))}
          disabled={pending}
          className={quiet}
        >
          Restore
        </button>
        <DeleteForever
          disabled={pending}
          onConfirm={() => run(() => deleteThread(threadId))}
        />
      </div>
    );
  }

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
        onClick={() => run(() => archiveThread(threadId, !archived), archived ? undefined : "/")}
        disabled={pending}
        className={quiet}
      >
        {archived ? "Unarchive" : "Archive"}
      </button>

      <button
        type="button"
        onClick={() => run(() => trashThread(threadId, true), "/")}
        disabled={pending}
        className={quiet}
      >
        Delete
      </button>
    </div>
  );
}

// Nothing brings the thread back after this, so it takes a second click.
function DeleteForever({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      disabled={disabled}
      className={armed ? `${quiet} border-warn-line text-warn` : quiet}
    >
      {armed ? "Click again to delete" : "Delete forever"}
    </button>
  );
}

export function QuickReply({
  threadId,
  replyFrom,
  replyTo,
  replySubject,
  initials,
}: Omit<Props, "archived" | "trashed"> & { initials: string }) {
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
