"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refreshing re-runs the server components, so the rail counts, the list and
// the open thread all update from one event.
export function LiveMail() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.onmessage = (event) => {
      if (event.data === "arrived") router.refresh();
    };

    return () => source.close();
  }, [router]);

  return null;
}
