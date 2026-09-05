import { ThreadList } from "@/components/mail/ThreadList";

// Address settings replace the reading pane, so the list keeps showing that
// address's mail alongside them.
export default async function AddressSettingsList({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <ThreadList address={decodeURIComponent(address)} />;
}
