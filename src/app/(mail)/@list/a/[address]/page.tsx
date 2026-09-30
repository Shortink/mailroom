import { ThreadList } from "@/components/mail/ThreadList";
import { requireAddress } from "@/lib/auth/require";

export default async function AddressList({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const [{ address: raw }, { filter, before }] = await Promise.all([params, searchParams]);
  // Filters within the current view, so an address outside it is not found.
  const { address } = await requireAddress(raw, "view");

  return (
    <ThreadList
      address={address}
      unreadOnly={filter === "unread"}
      before={before ? new Date(before) : undefined}
    />
  );
}
