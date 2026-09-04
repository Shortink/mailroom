"use client";

import { useState } from "react";
import type { Inbox } from "@/lib/mail/queries";
import { addAccount, issueInvite, signOut } from "./actions";

export function SettingsClient({ appUrl, accounts }: { appUrl: string; accounts: Inbox[] }) {
  const [link, setLink] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAddAccount(formData: FormData) {
    setPending(true);
    setAccountError(null);
    const { error } = await addAccount(String(formData.get("address") ?? ""));
    setPending(false);
    if (error) setAccountError(error);
    else setNewAddress("");
  }

  return (
    <div className="mx-auto max-w-[68ch] px-6 py-8">
      <section className="mb-10">
        <h2 className="mb-1.5 text-[15px] font-semibold tracking-[-0.01em]">Accounts</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
          Any address at your domain can send once it's added here. It becomes usable
          immediately, before any mail has ever touched it.
        </p>

        {accounts.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {accounts.map((account) => (
              <li
                key={account.address}
                className="flex h-10 items-center rounded-lg border border-rule bg-well px-3.5 text-[13px]"
              >
                {account.address}
              </li>
            ))}
          </ul>
        )}

        <form action={handleAddAccount} className="flex items-center gap-2.5">
          <input
            name="address"
            type="email"
            required
            value={newAddress}
            onChange={(event) => setNewAddress(event.target.value)}
            placeholder="name@yourdomain.com"
            className="h-10 flex-1 rounded-lg border border-rule bg-transparent px-3.5 text-[13px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 flex-none rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink disabled:opacity-60"
          >
            Add account
          </button>
        </form>
        {accountError && <p className="mt-2 text-[13px] text-red-600">{accountError}</p>}
      </section>

      <section className="mb-10">
        <h2 className="mb-1.5 text-[15px] font-semibold tracking-[-0.01em]">Invite someone</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
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
            className="h-10 rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink"
          >
            Create invite link
          </button>
        </form>

        {link && (
          <p className="mt-3 rounded-lg border border-rule bg-well px-3.5 py-2.5 font-mono text-xs break-all">
            {link}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1.5 text-[15px] font-semibold tracking-[-0.01em]">Sign out</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
          Ends this session and every other one, on every device.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="h-10 rounded-lg border border-rule px-4 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover"
          >
            Sign out everywhere
          </button>
        </form>
      </section>
    </div>
  );
}
