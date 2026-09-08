import { notFound } from "next/navigation";
import { AddressSettings } from "@/components/mail/AddressSettings";
import { requireUser } from "@/lib/auth/require";
import { loadAddress } from "@/lib/mail/addresses";
import { formatStamp, formatWhen } from "@/lib/format";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AddressSettingsPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  await requireUser();
  const { address } = await params;

  const detail = await loadAddress(decodeURIComponent(address));
  if (!detail) notFound();

  return (
    <AddressSettings
      detail={detail}
      when={{
        firstSeen: detail.firstSeen ? day.format(detail.firstSeen) : "never",
        lastActivity: detail.lastActivity ? formatWhen(detail.lastActivity) : "never",
        lastActivityExact: detail.lastActivity ? formatStamp(detail.lastActivity) : "no mail yet",
      }}
    />
  );
}
