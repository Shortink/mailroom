"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The server cannot know where the reader is, so the browser writes its zone
// once and asks for the render again.
export function Zone({ current }: { current: string }) {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone === current) return;

    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);

  return null;
}
