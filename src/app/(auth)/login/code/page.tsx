"use client";

import { useActionState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { submitCode } from "../actions";

export default function CodePage() {
  const [state, action] = useActionState(submitCode, null);

  return (
    <form action={action}>
      <AuthShell
        title="Enter your code"
        subtitle="Enter the code from your authenticator app."
        error={state?.error}
      >
        <Field label="Authenticator code" name="code" autoComplete="one-time-code" mono />
        <SubmitButton>Sign in</SubmitButton>
        <p className="mt-3.5 text-center text-xs text-ink3">
          Lost your device? Enter a recovery code instead.
        </p>
      </AuthShell>
    </form>
  );
}
