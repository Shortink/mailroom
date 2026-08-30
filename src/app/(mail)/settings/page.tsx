import { requireUser } from "@/lib/auth/require";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();

  return (
    <>
      <div className="flex h-11 flex-none items-center border-b border-rule px-3.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Settings</span>
      </div>
      <SettingsClient appUrl={process.env.APP_URL ?? ""} />
    </>
  );
}
