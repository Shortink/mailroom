"use client";

import { useActionState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { completeSetup } from "./actions";

export function SetupForm() {
  const [state, action] = useActionState(completeSetup, null);

  return (
    <form action={action}>
      <AuthShell
        title="Create your account"
        subtitle="This screen is only available until the first account exists."
        error={state?.error}
      >
        <Field label="Setup token" name="token" mono />
        <p className="mb-3 -mt-1.5 text-[11px] text-ink-3">Printed in the server logs at startup.</p>
        <Field label="Email" name="email" type="email" autoComplete="username" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" />
        <SubmitButton>Create account</SubmitButton>
      </AuthShell>
    </form>
  );
}
