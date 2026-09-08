import { requireUser } from "@/lib/auth/require";
import { listInboxes } from "@/lib/mail/queries";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  await requireUser();
  const { named } = await listInboxes();

  return <SettingsClient appUrl={process.env.APP_URL ?? ""} accounts={named} />;
}
