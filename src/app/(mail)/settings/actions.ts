"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { record } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/require";
import { createInvite } from "@/lib/auth/invites";
import { revokeSessions } from "@/lib/auth/revoke";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function issueInvite() {
  const userId = await requireUser();
  const token = await createInvite(userId);
  await record("invite.created", { actor: userId });

  revalidatePath("/settings");
  return { token };
}

export async function signOut() {
  const userId = await requireUser();

  // Bumping the version ends every other session too, not just this cookie.
  await revokeSessions(userId);
  await record("session.revoked", { actor: userId });

  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
