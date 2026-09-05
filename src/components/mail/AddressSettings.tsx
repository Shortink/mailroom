"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveAddress } from "@/app/(mail)/settings/actions";
import { colorForHue, hueFor, localPart, SWATCH_HUES } from "@/lib/mail/identity";
import type { AddressDetail } from "@/lib/mail/addresses";
import { useCompose } from "./Compose";

export function AddressSettings({ detail, when }: { detail: AddressDetail; when: Stamps }) {
  const compose = useCompose();
  const [, startTransition] = useTransition();

  const [label, setLabel] = useState(detail.label ?? "");
  const [displayName, setDisplayName] = useState(detail.displayName ?? "");
  const [replyTo, setReplyTo] = useState(detail.replyTo ?? "");
  const [hue, setHue] = useState(detail.hue ?? hueFor(detail.address));
  const [autoArchive, setAutoArchive] = useState(detail.autoArchive);

  function persist(patch: Parameters<typeof saveAddress>[1]) {
    startTransition(async () => {
      await saveAddress(detail.address, patch);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8 scroll-clean">
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-3 flex-none rounded-full" style={{ background: colorForHue(hue) }} />
        <h1 className="text-[25px] font-semibold tracking-[-0.02em]">
          {label || localPart(detail.address)}
        </h1>

        <div className="ml-auto flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() =>
              compose.open({ from: detail.address, to: "", subject: "" })
            }
            className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold text-btn-ink"
            style={{ background: "var(--btn)", boxShadow: "var(--btn-shadow)" }}
          >
            Send from this address
          </button>
          <Link
            href={`/a/${encodeURIComponent(detail.address)}`}
            className="rounded-[10px] border border-line px-3.5 py-2 text-[12.5px] text-ink2 transition-colors hover:bg-hover"
          >
            Back to mail
          </Link>
        </div>
      </div>

      <p className="mt-1.5 font-mono text-[11.5px] text-ink3">
        {detail.address} · {detail.named ? "named address" : "catch-all · unnamed"} ·{" "}
        {detail.named ? "added by you" : "detected by catch-all"}
      </p>

      <div className="mt-7 grid grid-cols-3 gap-[11px]">
        <Stat label="Received" value={String(detail.received)} sub={`${detail.unread} unread now`} />
        <Stat label="Sent" value={String(detail.sent)} sub={`first seen ${when.firstSeen}`} />
        <Stat label="Last activity" value={when.lastActivity} sub={when.lastActivityExact} />
      </div>

      <Card title="Delivery">
        <Row
          title="Auto-archive after 30 days"
          note="Quiet threads at this address leave the inbox on the next sweep."
        >
          <Switch
            on={autoArchive}
            onChange={(value) => {
              setAutoArchive(value);
              persist({ autoArchive: value });
            }}
          />
        </Row>

        <Row title="Colour" note="Marks this address in the rail, the list and the composer.">
          <div className="flex gap-2">
            {SWATCH_HUES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Colour ${swatch}`}
                onClick={() => {
                  setHue(swatch);
                  persist({ hue: swatch });
                }}
                className="size-5 rounded-full"
                style={{
                  background: colorForHue(swatch),
                  outline: hue === swatch ? "2px solid var(--ink)" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </Row>
      </Card>

      <Card title="Identity">
        <Row title="Label" note="What the rail calls this address.">
          <Input
            value={label}
            onChange={setLabel}
            onCommit={() => persist({ label: label.trim() || null })}
            placeholder={localPart(detail.address)}
          />
        </Row>

        <Row title="Display name" note="The name recipients see on mail sent from here.">
          <Input
            value={displayName}
            onChange={setDisplayName}
            onCommit={() => persist({ displayName: displayName.trim() || null })}
            placeholder="Your name"
          />
        </Row>

        <Row title="Reply-to" note="Where answers should go, if not back to this address.">
          <Input
            value={replyTo}
            onChange={setReplyTo}
            onCommit={() => persist({ replyTo: replyTo.trim() || null })}
            placeholder={detail.address}
            mono
          />
        </Row>
      </Card>
    </div>
  );
}

export interface Stamps {
  firstSeen: string;
  lastActivity: string;
  lastActivityExact: string;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[13px] border border-line bg-chip px-4 py-3.5">
      <p className="font-mono text-[10px] tracking-[0.1em] text-ink3 uppercase">{label}</p>
      <p className="mt-1 text-[20px] font-semibold">{value}</p>
      <p className="mt-0.5 font-mono text-[10.5px] text-ink3">{sub}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-mono text-[10px] tracking-[0.1em] text-ink3 uppercase">{title}</h2>
      <div className="overflow-hidden rounded-[14px] border border-line bg-chip">{children}</div>
    </section>
  );
}

function Row({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-6 border-b border-line2 px-4 py-3.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="block text-[12.5px] text-ink3">{note}</span>
      </span>
      <span className="flex-none">{children}</span>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex h-[22px] w-[38px] items-center rounded-full border px-[3px] transition-colors ${
        on ? "justify-end border-transparent bg-accent" : "justify-start border-line bg-chip"
      }`}
    >
      <span
        className={`size-3.5 rounded-full ${on ? "bg-white" : "bg-ink3"}`}
      />
    </button>
  );
}

function Input({
  value,
  onChange,
  onCommit,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      placeholder={placeholder}
      className={`w-[220px] rounded-[10px] border border-line bg-bg px-3 py-2 text-[12.5px] outline-none focus:border-accent ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}
