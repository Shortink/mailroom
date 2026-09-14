import { notFound } from "next/navigation";
import { AddressSettings } from "@/components/mail/AddressSettings";
import { requireUser } from "@/lib/auth/require";
import { formatDay, formatStamp, formatWhen } from "@/lib/format";
import { loadAddress } from "@/lib/mail/addresses";
import { readerZone } from "@/lib/zone";

export default async function AddressSettingsPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  await requireUser();
  const { address } = await params;

  const detail = await loadAddress(decodeURIComponent(address));
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
