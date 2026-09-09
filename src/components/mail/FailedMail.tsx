"use client";

import { useTransition } from "react";
import { retryFailedMail } from "@/app/(mail)/actions";

// Ingest gives up after a few attempts and nothing picks the message back up
// on its own, so this is the way out of that state.
export function FailedMail({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="rounded-[10px] border px-2.5 py-2"
      style={{
        background: "oklch(0.68 0.16 18 / 0.09)",
        borderColor: "oklch(0.68 0.16 18 / 0.4)",
      }}
    >
      <p className="text-[12.5px] font-medium">
        {count} {count === 1 ? "message" : "messages"} not fetched
      </p>
      <p className="mt-0.5 font-mono text-[10px] leading-[1.5] text-ink3">
        Resend took delivery but the content never arrived.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => void (await retryFailedMail()))}
        className="mt-2 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-ink2 transition-colors hover:bg-hover disabled:opacity-50"
      >
        {pending ? "trying…" : "try again"}
      </button>
    </div>
  );
}
