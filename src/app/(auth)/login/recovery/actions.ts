"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RECOVERY_COOKIE } from "@/lib/auth/recovery";

export async function dismissRecoveryCodes() {
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect("/");
}
