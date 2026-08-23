"use client";

import { useActionState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { claimInvite } from "./actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(claimInvite, null);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <AuthShell
        title="Accept your invite"
        subtitle="Choose the email and password you will sign in with."
        error={state?.error}
      >
        <Field label="Email" name="email" type="email" autoComplete="username" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" />
        <SubmitButton>Create account</SubmitButton>
      </AuthShell>
    </form>
  );
}
