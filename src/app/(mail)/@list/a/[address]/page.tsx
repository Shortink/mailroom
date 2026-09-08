import { ThreadList } from "@/components/mail/ThreadList";

export default async function AddressList({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const [{ address }, { filter, before }] = await Promise.all([params, searchParams]);

  return (
    <ThreadList
      address={decodeURIComponent(address)}
      unreadOnly={filter === "unread"}
      before={before ? new Date(before) : undefined}
    />
  );
}
