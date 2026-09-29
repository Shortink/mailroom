"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/auth/audit";
import { requireViewer } from "@/lib/auth/require";
import { createInvite } from "@/lib/auth/invites";
import { revokeSessions } from "@/lib/auth/revoke";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { reorderAddresses, updateAddress, type AddressPatch } from "@/lib/mail/addresses";
import { setLoadsImages } from "@/lib/mail/images";
import { addressOrder, addressSettings } from "@/lib/mail/limits";
import { registerAccount } from "@/lib/mail/queries";

export async function addAccount(address: string) {
  await requireViewer();

  const parsed = z.email().safeParse(address.trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };

  await registerAccount(parsed.data);
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/compose");
  return { error: null };
}

export async function issueInvite() {
  const viewer = await requireViewer();
  const token = await createInvite(viewer.userId);
  await record("invite.created", { actor: viewer.userId });

  revalidatePath("/settings");
  return { token };
}

export async function signOut() {
  const viewer = await requireViewer();

  // Bumping the version ends every other session too, not just this cookie.
  await revokeSessions(viewer.userId);
  await record("session.revoked", { actor: viewer.userId });

  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function saveAddress(address: string, patch: AddressPatch) {
  await requireViewer();

  const parsed = addressSettings.safeParse(patch);
  if (!parsed.success) return { error: "Those settings aren't valid." };

  await updateAddress(address, parsed.data);
  revalidatePath("/", "layout");
  return {};
}

export async function saveOrder(order: string[]) {
  await requireViewer();

  const parsed = addressOrder.safeParse(order);
  if (!parsed.success) return;

  await reorderAddresses(parsed.data);
  revalidatePath("/", "layout");
}

export async function saveLoadImages(on: boolean) {
  const viewer = await requireViewer();

  await setLoadsImages(viewer.userId, on);
  revalidatePath("/", "layout");
}
