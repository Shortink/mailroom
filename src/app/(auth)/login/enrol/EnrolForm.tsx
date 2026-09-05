"use client";

import { useActionState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { completeEnrolment } from "../actions";

export function EnrolForm({ qr, secret }: { qr: string; secret: string }) {
  const [state, action] = useActionState(completeEnrolment, null);

  if (state?.codes) {
    return (
      <AuthShell
        title="Save your recovery codes"
        subtitle="These are shown once. Each one signs you in if you lose your device."
      >
        <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-chip p-3 font-mono text-xs">
          {state.codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <a
          href="/"
          className="mt-4 flex h-8 w-full items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-btn-ink"
        >
          I have saved them
        </a>
      </AuthShell>
    );
  }

  return (
    <form action={action}>
      <AuthShell
        title="Set up two-factor"
        subtitle="Scan this with an authenticator app, then enter the code it shows."
        error={state?.error}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Two-factor setup code" className="mb-3 rounded-md border border-line" />
        <p className="mb-3 font-mono text-[11px] break-all text-ink3">{secret}</p>
        <Field label="Authenticator code" name="code" autoComplete="one-time-code" mono />
        <SubmitButton>Confirm</SubmitButton>
      </AuthShell>
    </form>
  );
}
