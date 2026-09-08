"use client";

import { usePathname } from "next/navigation";
import { useCompose } from "./Compose";
import { localPart } from "@/lib/mail/identity";

const NAMES: Record<string, string> = {
  "/": "All mail",
  "/b/sent": "Sent",
  "/b/archive": "Archive",
  "/settings": "Settings",
};

export function PaneToolbar({ defaultFrom }: { defaultFrom: string }) {
  const path = usePathname();
  const compose = useCompose();

  const title =
    NAMES[path] ?? (path.startsWith("/a/") ? localPart(decodeURIComponent(path.slice(3))) : null);

  return (
    <header className="flex flex-none items-center gap-2 border-b border-line px-6 py-3 max-md:hidden">
      {title && <span className="text-[13px] font-medium">{title}</span>}

      <button
        type="button"
        onClick={() => compose.open({ from: defaultFrom, to: "", subject: "" })}
        className="ml-auto rounded-[10px] px-4 py-2 text-[13px] font-semibold text-btn-ink"
        style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
      >
        Compose
      </button>
    </header>
  );
}
