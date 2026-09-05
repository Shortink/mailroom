"use client";

import { useRouter } from "next/navigation";
import { BackIcon, CloseIcon, DraftIcon } from "@/components/icons";
import { useCompose } from "./Compose";
import { useFrame } from "./ShellFrame";

// Phone-only chrome. The rail is a drawer here and the reading pane replaces
// the list, so this bar carries the two controls that would otherwise be lost.
export function MobileBar({ defaultFrom }: { defaultFrom: string }) {
  const { paneOpen, railOpen, toggleRail } = useFrame();
  const compose = useCompose();
  const router = useRouter();

  return (
    <header className="flex flex-none items-center gap-2 border-b border-line bg-rail px-3 py-2.5 backdrop-blur-[20px] md:hidden">
      {paneOpen ? (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back to mail"
          className="flex size-8 items-center justify-center rounded-lg border border-line text-ink2"
        >
          <BackIcon className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleRail}
          aria-label={railOpen ? "Close menu" : "Open menu"}
          className="flex size-8 items-center justify-center rounded-lg border border-line text-ink2"
        >
          {railOpen ? <CloseIcon className="size-4" /> : <MenuGlyph />}
        </button>
      )}

      <span className="truncate text-[13px] font-semibold">Mailroom</span>

      <button
        type="button"
        onClick={() => compose.open({ from: defaultFrom, to: "", subject: "" })}
        aria-label="New message"
        className="ml-auto flex size-9 flex-none items-center justify-center rounded-full text-btn-ink"
        style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
      >
        <DraftIcon className="size-4" />
      </button>
    </header>
  );
}

function MenuGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
