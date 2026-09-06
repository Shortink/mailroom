import { ThreadList } from "@/components/mail/ThreadList";

export default async function AllMailList({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const { filter, before } = await searchParams;

  return (
    <ThreadList unreadOnly={filter === "unread"} before={before ? new Date(before) : undefined} />
  );
}
