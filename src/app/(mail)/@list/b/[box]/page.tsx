import { notFound } from "next/navigation";
import { DraftListPane } from "@/components/mail/DraftListPane";
import { ThreadList } from "@/components/mail/ThreadList";
import type { Box } from "@/lib/mail/queries";

const BOXES: Box[] = ["sent", "archive"];

export default async function BoxList({
  params,
  searchParams,
}: {
  params: Promise<{ box: string }>;
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const { box } = await params;
  if (box === "drafts") return <DraftListPane />;

  if (!BOXES.includes(box as Box)) notFound();
  const { filter, before } = await searchParams;

  return (
    <ThreadList
      box={box as Box}
      unreadOnly={filter === "unread"}
      before={before ? new Date(before) : undefined}
    />
  );
}
