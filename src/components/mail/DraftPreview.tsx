"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { discardDraft } from "@/app/(mail)/actions";
import { addressColor } from "@/lib/mail/identity";
import { useCompose } from "./Compose";
import type { Draft } from "./Compose";

export function DraftPreview({ draft, saved }: { draft: Draft & { id: string }; saved: string }) {
  const compose = useCompose();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 py-6 scroll-clean">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 rounded-full bg-chip px-2.5 py-1 text-[11.5px]">
          <span
            className="size-[7px] rounded-full"
            style={{ background: addressColor(draft.from) }}
          />
          <span className="font-mono">{draft.from || "no address"}</span>
        </span>
        <span className="font-mono text-[11px] text-ink3">unsent draft · saved {saved}</span>
      </div>

      <h1 className="max-w-[720px] flex-none text-[27px] leading-[1.2] font-semibold tracking-[-0.02em] text-pretty">
        {draft.subject || "(no subject)"}
      </h1>

      <div className="flex flex-none items-center gap-3">
        <span className="text-[13px] text-ink2">To {draft.to || "nobody yet"}</span>

        <div className="ml-auto flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => compose.open(draft)}
            className="rounded-[10px] px-3.5 py-1.5 text-[12.5px] font-semibold text-btn-ink"
            style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
          >
            Continue editing
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await discardDraft(draft.id);
                router.push("/b/drafts");
              });
            }}
            className="rounded-[10px] border border-line px-3.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:bg-hover disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      </div>

      <div className="flex-none rounded-[14px] border border-line bg-chip px-4 py-4">
        {draft.body?.trim() ? (
          <pre className="max-w-[680px] font-sans text-[14.5px] leading-[1.75] whitespace-pre-wrap text-ink2">
            {draft.body}
          </pre>
        ) : (
          <p className="text-[13px] text-ink3">Nothing written yet.</p>
        )}
      </div>
    </div>
  );
}
