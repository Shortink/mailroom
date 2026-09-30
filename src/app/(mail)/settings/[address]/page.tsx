import { notFound } from "next/navigation";
import { AddressSettings } from "@/components/mail/AddressSettings";
import { requireAddress } from "@/lib/auth/require";
import { formatDay, formatStamp, formatWhen } from "@/lib/format";
import { loadAddress } from "@/lib/mail/addresses";
import { readerZone } from "@/lib/zone";

export default async function AddressSettingsPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { viewer, address } = await requireAddress((await params).address, "allowed");

  const detail = await loadAddress(viewer.allowed, address);
  if (!detail) notFound();

  const zone = await readerZone();

  return (
    <AddressSettings
      detail={detail}
      when={{
        firstSeen: detail.firstSeen ? formatDay(detail.firstSeen, zone) : "never",
        lastActivity: detail.lastActivity ? formatWhen(detail.lastActivity, zone) : "never",
        lastActivityExact: detail.lastActivity ? formatStamp(detail.lastActivity, zone) : "no mail yet",
      }}
    />
  );
}
