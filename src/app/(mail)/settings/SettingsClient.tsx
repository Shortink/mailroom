"use client";

import { useState } from "react";
import { addressColor } from "@/lib/mail/identity";
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
    <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8 scroll-clean">
      <h1 className="mb-8 text-[25px] font-semibold tracking-[-0.02em]">Settings</h1>

      <Section
        title="Addresses"
        note="Any address on your domain can send once it is added here. It works immediately, before any mail has touched it."
      >
        {accounts.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {accounts.map((account) => (
              <li
                key={account.address}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-chip px-3.5 py-2.5"
              >
                <span
                  className="size-[7px] flex-none rounded-full"
                  style={{ background: addressColor(account.address) }}
                />
                <span className="font-mono text-[12.5px]">{account.address}</span>
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
            className="flex-1 rounded-[10px] border border-line bg-chip px-3 py-2.5 text-[13px] outline-none focus:border-accent"
          />
          <Button disabled={pending}>Add address</Button>
        </form>

        {accountError && (
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--err)" }}>
            {accountError}
          </p>
        )}
      </Section>

      <Section
        title="Invite someone"
        note="Single use, expires in 48 hours. They choose their own password and set up two-factor."
      >
        <form
          action={async () => {
            const { token } = await issueInvite();
            setLink(`${appUrl}/invite/${token}`);
          }}
        >
          <Button>Create invite link</Button>
        </form>

        {link && (
          <p className="mt-3 rounded-xl border border-line bg-chip px-3.5 py-2.5 font-mono text-[11.5px] break-all">
            {link}
          </p>
        )}
      </Section>

      <Section title="Sign out" note="Ends this session and every other one, on every device.">
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-[10px] border border-line px-4 py-2.5 text-[13px] font-medium text-ink2 transition-colors hover:bg-hover"
          >
            Sign out everywhere
          </button>
        </form>
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 max-w-[62ch]">
      <h2 className="mb-1.5 text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mb-4 text-[13px] leading-[1.7] text-ink3">{note}</p>
      {children}
    </section>
  );
}

function Button({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex-none rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-btn-ink disabled:opacity-60"
      style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
    >
      {children}
    </button>
  );
}
