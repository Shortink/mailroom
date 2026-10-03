"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/auth/audit";
import { requireOwner, requireViewer } from "@/lib/auth/require";
import { createInvite } from "@/lib/auth/invites";
import { removeMember, setMemberAddresses } from "@/lib/auth/people";
import { Refusal } from "@/lib/auth/refusal";
import { revokeSessions } from "@/lib/auth/revoke";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { normalizeAddress } from "@/lib/mail/identity";
import { reachesAddress } from "@/lib/mail/reach";
import { reorderAddresses, updateAddress, type AddressPatch } from "@/lib/mail/addresses";
import { setLoadsImages } from "@/lib/mail/images";
import { addressOrder, addressSettings, memberAddressList } from "@/lib/mail/limits";
import { registerAccount } from "@/lib/mail/queries";

export async function addAccount(address: string) {
  await requireOwner();

  const parsed = z.email().safeParse(address.trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };

  await registerAccount(parsed.data);
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/compose");
  return { error: null };
}

export async function issueInvite(addresses: string[]) {
  const viewer = await requireOwner();
  const parsed = memberAddressList.safeParse(addresses);
  if (!parsed.success) return { error: "Choose at least one address.", token: null };

  const token = await createInvite(viewer.userId, parsed.data);
  await record("invite.created", { actor: viewer.userId, detail: { addresses: parsed.data } });
  revalidatePath("/settings");
  return { error: null, token };
}

export async function updateMember(userId: string, addresses: string[]) {
  const viewer = await requireOwner();
  const parsed = memberAddressList.safeParse(addresses);
  if (!parsed.success) return { error: "Choose at least one address." };

  try {
    await setMemberAddresses(userId, parsed.data);
  } catch (error) {
    return { error: error instanceof Refusal ? error.message : "Could not change that." };
  }
  await record("member.changed", { actor: viewer.userId, detail: { userId, addresses: parsed.data } });
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteMember(userId: string) {
  const viewer = await requireOwner();
  if (await removeMember(userId)) {
    await record("member.removed", { actor: viewer.userId, detail: { userId } });
  }
  revalidatePath("/", "layout");
}

export async function signOut() {
  const viewer = await requireViewer();

  // Bumping the version ends every other session too, not just this cookie.
  await revokeSessions(viewer.userId);
  await record("session.revoked", { actor: viewer.userId });

  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function saveAddress(raw: string, patch: AddressPatch) {
  const viewer = await requireViewer();
  const address = normalizeAddress(raw);
  if (!(await reachesAddress(viewer.allowed, address))) notFound();

  // The sidebar's pins, visibility and names are the owner's arrangement, so a
  // member's patch keeps only the fields listed here.
  const schema =
    viewer.role === "owner"
      ? addressSettings
      : addressSettings.pick({ displayName: true, replyTo: true, hue: true, autoArchive: true });
  const parsed = schema.safeParse(patch);
  if (!parsed.success) return { error: "Those settings aren't valid." };

  await updateAddress(address, parsed.data);
  revalidatePath("/", "layout");
  return {};
}

export async function saveOrder(order: string[]) {
  await requireOwner();

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
