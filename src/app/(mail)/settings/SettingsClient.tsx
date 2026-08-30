"use client";

import { useState } from "react";
import { issueInvite, signOut } from "./actions";

export function SettingsClient({ appUrl }: { appUrl: string }) {
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="max-w-[68ch] px-5 py-6">
      <section className="mb-8">
        <h2 className="mb-1 text-base font-semibold tracking-[-0.015em]">Invite someone</h2>
        <p className="mb-3 text-[13px] text-ink-3">
          Single use, expires in 48 hours. They choose their own password and set up two-factor.
        </p>

        <form
          action={async () => {
            const { token } = await issueInvite();
            setLink(`${appUrl}/invite/${token}`);
          }}
        >
          <button
            type="submit"
            className="h-7 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-ink"
          >
            Create invite link
          </button>
        </form>

        {link && (
          <p className="mt-3 rounded-md border border-rule bg-well px-3 py-2 font-mono text-xs break-all">
            {link}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold tracking-[-0.015em]">Sign out</h2>
        <p className="mb-3 text-[13px] text-ink-3">
          Ends this session and every other one, on every device.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="h-7 rounded-md border border-rule px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover"
          >
            Sign out everywhere
          </button>
        </form>
      </section>
    </div>
  );
}
