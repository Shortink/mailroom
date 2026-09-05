"use client";

import { useEffect, useRef } from "react";
import { markRead } from "@/app/(mail)/actions";

// Fires once when a thread is opened. The ref survives re-renders, so a
// revalidation cannot send the same thread back through the action.
export function MarkRead({ threadId, unread }: { threadId: string; unread: boolean }) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!unread || done.current === threadId) return;
    done.current = threadId;
    void markRead(threadId);
  }, [threadId, unread]);

  return null;
}
