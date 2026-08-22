"use client";

import { useActionState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, action] = useActionState(signIn, null);

  return (
    <form action={action}>
      <AuthShell title="Sign in" subtitle="Mail for your domain" error={state?.error}>
        <Field label="Email" name="email" type="email" autoComplete="username" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton>Continue</SubmitButton>
      </AuthShell>
    </form>
  );
}
