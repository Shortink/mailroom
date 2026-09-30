import { ThreadList } from "@/components/mail/ThreadList";
import { requireAddress } from "@/lib/auth/require";

// Address settings replace the reading pane, so the list keeps showing that
// address's mail alongside them.
export default async function AddressSettingsList({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await requireAddress((await params).address, "allowed");
  return <ThreadList address={address} />;
}
