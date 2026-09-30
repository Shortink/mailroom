import { EmptyPane } from "@/components/mail/EmptyPane";
import { requireAddress } from "@/lib/auth/require";

export default async function AddressPane({ params }: { params: Promise<{ address: string }> }) {
  await requireAddress((await params).address, "view");
  return <EmptyPane />;
}
