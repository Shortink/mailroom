import { ThreadList } from "@/components/mail/ThreadList";

export default async function AllMailList({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  return <ThreadList unreadOnly={filter === "unread"} />;
}
