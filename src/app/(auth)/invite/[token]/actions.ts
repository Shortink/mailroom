"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/auth/invites";
import { Refusal } from "@/lib/auth/refusal";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth/session";

export async function claimInvite(_: unknown, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = await acceptInvite(token, email, password);
    (await cookies()).set(SESSION_COOKIE, await signSession(user.id, "totp"), cookieOptions("totp"));
  } catch (error) {
    return { error: error instanceof Refusal ? error.message : "Could not accept the invite." };
  }

  redirect("/login/enrol");
}
