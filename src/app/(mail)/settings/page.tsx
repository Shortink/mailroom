import { requireUser } from "@/lib/auth/require";
import { listHidden } from "@/lib/mail/addresses";
import { listInboxes } from "@/lib/mail/queries";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  await requireUser();
  const [{ named }, hidden] = await Promise.all([listInboxes(), listHidden()]);

  return <SettingsClient appUrl={process.env.APP_URL ?? ""} accounts={named} hidden={hidden} />;
}
