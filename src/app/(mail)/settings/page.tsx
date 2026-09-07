import { requireUser } from "@/lib/auth/require";
import { listInboxes } from "@/lib/mail/queries";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  const { pinned } = await listInboxes();

  return (
    <>
      <div className="flex h-14 flex-none items-center border-b border-rule px-6">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Settings</span>
      </div>
      <SettingsClient appUrl={process.env.APP_URL ?? ""} accounts={pinned} />
    </>
  );
}
