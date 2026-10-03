"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { Person } from "@/lib/auth/people";
import { addressColor, normalizeAddress } from "@/lib/mail/identity";
import type { Inbox } from "@/lib/mail/queries";
import { Switch } from "@/components/mail/AddressSettings";
import { stopShowingImages } from "../actions";
import { addAccount, deleteMember, issueInvite, saveLoadImages, signOut, updateMember } from "./actions";

export function SettingsClient({
  appUrl,
  owner,
  accounts,
  hidden,
  imageSenders,
  loadImages,
  people,
}: {
  appUrl: string;
  owner: boolean;
  accounts: Inbox[];
  hidden: string[];
  imageSenders: string[];
  loadImages: boolean;
  people: Person[];
}) {
  const [loadAll, setLoadAll] = useState(loadImages);
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
        note={
          owner
            ? "Any address on your domain can send once it is added here. It works immediately, before any mail has touched it."
            : "The addresses you read and send from. Open one to change how it sends."
        }
      >
        {accounts.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {accounts.map((account) => (
              <li key={account.address}>
                <Link
                  href={`/settings/${encodeURIComponent(account.address)}`}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-chip px-3.5 py-2.5 transition-colors hover:bg-hover"
                >
                  <span
                    className="size-[7px] flex-none rounded-full"
                    style={{ background: addressColor(account.address) }}
                  />
                  <span className="font-mono text-[12.5px]">{account.address}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {owner && (
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
        )}

        {accountError && <ErrorLine>{accountError}</ErrorLine>}

        {hidden.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[12.5px] text-ink3">
              Hidden from the sidebar. Open one to bring it back.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {hidden.map((address) => (
                <li key={address}>
                  <Link
                    href={`/settings/${encodeURIComponent(address)}`}
                    className="block rounded-full border border-line px-3 py-1 font-mono text-[11.5px] text-ink2 transition-colors hover:bg-hover"
                  >
                    {address}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {owner && (
        <People
          appUrl={appUrl}
          people={people}
          options={[...accounts.map((account) => account.address), ...people.flatMap((p) => p.addresses)]}
        />
      )}

      <Section
        title="Remote images"
        note="A remote image tells the sender you opened their mail. Mail that fails authentication is always blocked."
      >
        <div className="flex items-center gap-4 rounded-xl border border-line bg-chip px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[13px]">Load remote images without asking</span>
          <Switch
            label="Load remote images without asking"
            on={loadAll}
            onChange={(value) => {
              setLoadAll(value);
              saveLoadImages(value);
            }}
          />
        </div>

        {imageSenders.length > 0 && (
          <>
            <p className="mt-4 mb-2 text-[12.5px] text-ink3">
              {loadAll ? "Allowed senders, used when this is off." : "Always loaded from these senders."}
            </p>
            <ul className="flex flex-col gap-1.5">
              {imageSenders.map((sender) => (
                <li
                  key={sender}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-chip px-3.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{sender}</span>
                  <button type="button" onClick={() => stopShowingImages(sender)} className={small}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
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

function People({ appUrl, people, options }: { appUrl: string; people: Person[]; options: string[] }) {
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Section
      title="People"
      note="Each member sees and sends from the addresses you give them. You still see everything."
    >
      <ul className="mb-4 flex flex-col gap-1.5">
        {people.map((person) => (
          <li key={person.id} className="rounded-xl border border-line bg-chip px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{person.email}</span>
                {person.addresses.length > 0 && (
                  <span className="block truncate font-mono text-[11.5px] text-ink3">
                    {person.addresses.join(", ")}
                  </span>
                )}
              </span>
              <span className="flex-none text-[12px] text-ink3">
                {person.role === "owner" ? "Owner" : "Member"}
              </span>
              {person.role === "member" && editing !== person.id && (
                <>
                  <button type="button" onClick={() => setEditing(person.id)} className={small}>
                    Edit
                  </button>
                  <RemoveMember userId={person.id} />
                </>
              )}
            </div>

            {editing === person.id && (
              <div className="mt-3 border-t border-line2 pt-3">
                <AddressPicker
                  options={options}
                  initial={person.addresses}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (selected) => {
                    const { error } = await updateMember(person.id, selected);
                    if (!error) setEditing(null);
                    return error;
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {inviting ? (
        <div className="rounded-xl border border-line bg-chip px-3.5 py-3">
          <p className="mb-3 text-[12.5px] text-ink3">
            Single use, expires in 48 hours. They choose their own password and set up two-factor.
          </p>
          <AddressPicker
            options={options}
            initial={[]}
            submitLabel="Create invite link"
            onCancel={() => setInviting(false)}
            onSubmit={async (selected) => {
              const { error, token } = await issueInvite(selected);
              if (token) {
                setLink(`${appUrl}/invite/${token}`);
                setInviting(false);
              }
              return error;
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLink(null);
            setInviting(true);
          }}
          className="rounded-[10px] border border-line px-4 py-2.5 text-[13px] font-medium text-ink2 transition-colors hover:bg-hover"
        >
          Invite someone
        </button>
      )}

      {link && (
        <p className="mt-3 rounded-xl border border-line bg-chip px-3.5 py-2.5 font-mono text-[11.5px] break-all">
          {link}
        </p>
      )}
    </Section>
  );
}

// Nothing brings the login back after this, so it takes a second click.
function RemoveMember({ userId }: { userId: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(event) => {
        if (!armed) {
          setArmed(true);
          return;
        }
        // A double-click would otherwise arm and confirm in one gesture.
        if (event.detail > 1) return;
        startTransition(() => deleteMember(userId));
      }}
      onBlur={() => setArmed(false)}
      className={armed ? `${small} border-warn-line text-warn` : small}
    >
      {armed ? "Remove for good" : "Remove"}
    </button>
  );
}

function AddressPicker({
  options,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  options: string[];
  initial: string[];
  submitLabel: string;
  onSubmit: (selected: string[]) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [listed, setListed] = useState(() => [...new Set([...options, ...initial])]);
  const [selected, setSelected] = useState(initial);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const typedRef = useRef<HTMLInputElement>(null);

  function toggle(address: string, on: boolean) {
    setSelected((current) => (on ? [...current, address] : current.filter((a) => a !== address)));
  }

  // Null when what was typed isn't an address.
  function addTyped() {
    const address = normalizeAddress(typed);
    if (!address) return selected;
    if (!typedRef.current?.checkValidity()) {
      setError("Enter a valid email address.");
      return null;
    }
    setError(null);
    setListed((current) => (current.includes(address) ? current : [...current, address]));
    const next = selected.includes(address) ? selected : [...selected, address];
    setSelected(next);
    setTyped("");
    return next;
  }

  async function submit() {
    const chosen = addTyped();
    if (!chosen) return;
    if (chosen.length === 0) {
      setError("Choose at least one address.");
      return;
    }
    setPending(true);
    setError(await onSubmit(chosen));
    setPending(false);
  }

  return (
    <form action={submit}>
      {listed.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {listed.map((address) => (
            <li key={address}>
              <label className="flex items-center gap-2.5 py-0.5 font-mono text-[12.5px]">
                <input
                  type="checkbox"
                  checked={selected.includes(address)}
                  onChange={(event) => toggle(address, event.target.checked)}
                  className="accent-accent"
                />
                {address}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2.5">
        <input
          ref={typedRef}
          type="email"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            // Enter here adds the address rather than sending the form.
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            }
          }}
          placeholder="Another address"
          className="flex-1 rounded-[10px] border border-line bg-bg px-3 py-2 text-[12.5px] outline-none focus:border-accent"
        />
        <button type="button" onClick={addTyped} className={small}>
          Add
        </button>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="mt-3 flex items-center gap-2.5">
        <Button disabled={pending}>{submitLabel}</Button>
        <button type="button" onClick={onCancel} className={small}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const small =
  "flex-none rounded-md border border-line px-2 py-0.5 text-[11.5px] text-ink2 transition-colors hover:bg-hover";

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[12.5px]" style={{ color: "var(--err)" }}>
      {children}
    </p>
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
