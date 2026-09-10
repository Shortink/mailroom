import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RECOVERY_COOKIE } from "@/lib/auth/recovery";
import { dismissRecoveryCodes } from "./actions";

export default async function RecoveryPage() {
  const codes = (await cookies()).get(RECOVERY_COOKIE)?.value.split(",").filter(Boolean) ?? [];

  // Nothing to show means the codes were dismissed, or this was opened directly.
  if (codes.length === 0) redirect("/");

  return (
    <AuthShell
      title="Save your recovery codes"
      subtitle="These are shown once. Each one signs you in if you lose your device."
    >
      <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-chip p-3 font-mono text-xs">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <form action={dismissRecoveryCodes}>
        <button
          type="submit"
          className="mt-4 flex h-8 w-full items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-btn-ink"
        >
          I have saved them
        </button>
      </form>
    </AuthShell>
  );
}
